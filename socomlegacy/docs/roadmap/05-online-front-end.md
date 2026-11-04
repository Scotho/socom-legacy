# 05 -- The online front end (`ONL-`)

Every online screen the game's client draws, from ONLINE on the main menu to the game lobby, the loading screen, the
round and final screens and back: login, DNAS, universe, persona, agreement, the SOCOM II ONLINE menu, briefing rooms,
create game and the map selector, the game lobby, spectating, errors, chat panels, friends, ignore, clan pages and
rankings. The rule between this segment and 06: **ONL owns the client screens and their flows; SVC owns the
operations, rules, persistence and protocol behind them.** A screen task names the service task it calls.

**The reading this segment rests on, ruled (OC-0; the owner, 2026-10-01, R2):** "all of SOCOM 2 except for
multiplayer" plus the full online front end means: **the client is ported** -- the browser reproduces every online
screen and behaviour the game's client runs -- and **the server side, multiplayer's, is ours**, because the original
servers are gone ([`../MISSION.md`](../MISSION.md)).

The campaign skip does not touch this segment. The match's own menus -- the in-round START menu, its ABORT path back to
the game lobby -- and the ledger of the round's open 1:1 gaps are segment 07 ([07-match.md](07-match.md)); this segment
takes the captures they need in ONL-32's window. Conventions: [README](README.md#conventions). Paths `A_*`, `B_*` are
under `logs/parity/s4_pcsx2/` (PCSX2 on our Horizon) unless named otherwise.

## Facts this segment rests on

| # | Fact | Source |
|---|---|---|
| N1 | The `RUN/UI/READERC.ZAR` members the online and shared flows use: dlgNetLogin, dlgNetAuthenticate, dlgNetServerSelect, dlgNetPlayerName, dlgNetConnect, dlgUsagePolicy, dlgWorldOfSOCOM, dlgMPBriefingRoom, dlgCreateGame, dlgGameLobby, dlgOnlineFilters, dlgOnlineOptions, dlgSetSOP, dlgSetTaunts, dlgFriendList, dlgIgnoreList, dlgCreateClan, dlgManageRoster, dlgManageRosterLeader, dlgInvitedPlayers, dlgRespondToInvites, dlgLadderLobby, dlgClanLadderLobby, dlgNetError, dlgNetAbort, dlgNetAbandoned, dlgNetBanned, dlgDownloadPatch, dlgReturnFromNTGUI2, dlgLoad, dlgAfterErrorReboot, dlgAfterReboot, dlgMPswitch, mp_rooms. `RUN/UI/READERX.ZAR` holds dlgMultiplayerRound/Final/FinalReally; `RUN/COMMON/SPLA_TXR.ZED`/`SPLA_PAL.ZED` the splash library. (`dlgCareerStats` and `dlgSelectRank` are campaign dialogs -- the README's future scope and MENU-10 -- and `dlgCareerStats` is not the online PLAYER INFO page, SVC-15/ONL-30) | `tools_py/card_save.py` `parse_zar` of both archives; `ls RUN/COMMON` |
| N2 | Each online dialog has a script set in `RUN/UIZANIM.ZAR` (19,794 keys) except dlgSetSOP and dlgLoad; the round and final screens' sets are in `RUN/MPZANIM.ZAR` | key names |
| N3 | Menu strings: `RUN/LOCALE/STATES/UIMNLOC.ZAR` -> `UIMnLOC.rdr` (221,480 B), `_<id>_<Name>_MSG`; online ranges 395-460, 507-548, 559-614, 638-687, 724-800, 1105-1144 (DNAS). *Corrected by PLAT-06: the ranges are mostly online but neither pure nor complete -- 507-548 holds the main menu's legal lines 507-508, no dialog or set names 1105-1144 (the DNAS errors are the code's), and 534 of the 1,441 ids are named only by online dialogs, from 6 to 1441* | web R96 §6: 1,411 strings, ids 1-1441 (`parseLocTable`, `packages/scene/src/uiLoc.ts`; `tools/dump-dialogs.ts --msg-users <from> <to>`); the online strings by dialog are ONL-33's (R96 §9) |
| N4 | Console flow on our Horizon: ONLINE -> "Select MEMORY CARD slot" (`A_30`) -> LOGIN TO SOCOM II ONLINE (`A_06`, `A_31`; no-config popup `A_05`) -> SELECT UNIVERSE (`A_34`) -> CONNECT TO SOCOM II (`A_35`) -> persona list (`A_36`) -> name keyboard (`A_37`) -> "write down your name" (`A_41`) -> "save to the memory card?" (`A_42`) -> USER AGREEMENT (`A_43`) -> SOCOM II ONLINE with SERVER NEWS (`A_44`) -> the menu (`A_45`) | `A_05..A_45` |
| N5 | Our recomp's LOGIN draws an empty configuration list and HARDWARE line; CROSS on LOGIN still reaches the universe screen. The recomp's eznetcnf/eznetctl HLE always answers "Setting 1" on "SCE/Ethernet (Network Adaptor)" with the link up, without reading the card | `logs/parity/s17_q2_logoff/online1/00_login.png`, `01_universe.png`; `scripts/parity/launch_to_online_ours.txt`; `third_party/ps2recomp/ps2xIOP/src/modules/eznetcnf.cpp:1-45` |
| N6 | SOCOM II ONLINE rows in order: MESSAGES, BRIEFING ROOMS, AUTOPLAY, CLAN, PLAYER RANKING, CLAN RANKING, NO INVITATIONS (greyed), REFRESH LIST, OPTIONS, FRIENDS, IGNORE; persona name bottom left behind a star; green network dot top right (`NetMonB/NetMonY.tif`); help lines UIMnLOC 781-791 (*corrected by PLAT-06: the set names no 792*; *corrected 2026-10-01 (PLAT-06's review): 793 `_793_YoullBeLoggingOff_MSG` is not a help line but the logoff POPUP of the set's `exit_lobby` (N17), and 792 `_792_CreateOrManageClan_MSG` is named by no layout and no set in any archive*); MESSAGES shows "News of the day..." and a "Clan messages" band | `A_45_lobby2.png`; the dialog's contents: web R96 §7 (`tools/dump-dialogs.ts --dialog dlgWorldOfSOCOM.rdr`: the eleven row buttons `newsandmessages` .. `Ignore` in this order, `NetMonY.tif`/`NetMonB.tif`, the set's ids) |
| N7 | DNAS screen `dlgNetAuthenticate`: `_534` CONNECTING TO INTERNET, `_535` AUTHENTICATING DNAS DATA, `_536/_537` LOCATING (AVAILABLE SOCOM II) UNIVERSES, `_533` AUTHENTICATING, `_532_DnasLogotype`, `_538` CONNECT FAILURE, `_450`; `DNASLogo.tif`; errors 1105-1144, 1232-1235 (*PLAT-06: the layout names 149, 446, 532, 533, its set 448, 534-537 and 450; 538 and the error ranges are named by neither -- the code's*). `DNASAuthenticate` (`FUN_002cc670`) is replaced in the recomp by `socom2_DnasTickDone` (done at once); PSRewired's r0001 pnach does the same (`jr ra`); r0004's address `FUN_002cf330` | the dialog: web R96 §7 (`tools/dump-dialogs.ts --dialog dlgNetAuthenticate.rdr`); `DNASAuthenticate` -> 0x2cc670 is binding-table row 197 (R96 §4); `third_party/ps2recomp/ps2xRuntime/src/lib/game_overrides_socom2.cpp:120-131, 2107-2115` (`socom2_DnasTickDone` and its `replaceFunction`); KNOWN [r0004-dnas] |
| N8 | Briefing rooms list: ROOM NAME, # of PLAYERS, ELIGIBLE RANKS (four rank icons); the console capture shows "Channel 1"; our Horizon invents "Alpha".."Delta" when no channel exists (server-made) | `A_47_rooms.png`; `server/horizon-server/Server.Medius/Medius/MLS.cs:3380-3384`; server/README `3a46ff0e` |
| N9 | BRIEFING ROOM: CREATE GAME, JOIN GAME, WATCH GAME, PLAYER LIST, REFRESH LIST; chat panel ("L1 and L2 to scroll chat"); games list IN/MAX, SPEC/MAX, GAME, PING, PASS, CLAN; GAME DETAILS (map, play list, round count, round time, rank icons); "R1 TEXT CHAT / TRIANGLE BACK / CROSS SELECT" | `A_48`, `B_43_gameslist.png`; UIMnLOC 401-420, 518-523 |
| N10 | CREATE GAME rows and defaults: GAME NAME, PASSWORD (NO), PLAYERS 16, ROUND COUNT 11, ROUND TIME 6 min (4-10), FRIENDLY FIRE disabled, EQUIPMENT No limitations (Pistols/Shotguns/Snipers only, No bombs), SPECTATORS YES No Password, RESTORE DEFAULTS, RESPAWN disabled, RANK RESTRICTIONS (4 icons), CLAN OPTIONS (Randomly / clan to Terrorists / clan to SEALs / Members only / Alternate teams, "Requires 100% ready to launch"), CHOOSE GAMES; SQUARE creates | `A_49..A_52`; UIMnLOC 228-293; web R91 §9 |
| N11 | PLAY LIST: AVAILABLE MAPS (24 entries from Medley, Random, VIGILANCE, ...), preview picture, SELECTED MAPS LIST, "EDIT SELECTED MAP LIST / SQUARE ACCEPT PLAY LIST / CROSS SELECT MAP / TRIANGLE BACK"; Medley contains all maps and deletes the others; our recomp's 24-entry order is `online_login_ours.MAP_SCAN_ORDER`; previews `mpNNMissPic.tif` | `A_51_choosegames.png`; PC research 33:8-11; `scripts/parity/refs/map_*.png` |
| N12 | A host's world report: `GameName:test$~Channel 1`, `MinPlayers:2`, `MaxPlayers:24` (16 + 8 spectators), `GameLevel:51` (Vigilance), `GenericField2:0000FDE8` (65000; matching "AnySpeed65000" is an inference), `GameStats` (map and rules; the server must keep them or joins are refused) | `s4_pcsx2/slice-Medius.log`; server/README `f4ab598f` |
| N13 | GAME LOBBY: title band (channel, game, map), ARMORY, SWITCH TEAMS, READY; SPECTATORS, SEALS, TERRORISTS columns with ready dots and a star; "CIRCLE VOICE CHAT ALL / TRIANGLE BACK / CROSS SELECT"; a talk-icon box bottom left; "The READY button will be available in 30 seconds. There must be players on both teams to launch." (350); countdown label "NOT READY n" | `A_53`, `A_54_gamelobby2.png`, `A_55`, `A_ready006`; UIMnLOC 338-367 |
| N14 | `A_ready006` shows the host green and the other player red while the label reads NOT READY 5; web R91 §18.4 calls that frame "both ready (green)" -- **the frame contradicts the note** | `A_ready006.png` vs `91-the-round.md` §18 table 4 |
| N15 | Loading screen: map name, map picture with markers, game type, SEALs/TERRORISTS objectives, a spinning disc, "TRIANGLE TO RETURN TO THE LOBBY." (UILdLOC 2000); ~12 s; data `LDZANIM.ZAR`, `UILDLOC.ZAR`, `LOAD_TXR.ZED`, and the picture's bank `mission.rdr` `LoadingScreenAssets` names, `OMnn_TXR.ZED` (MP1-MP12) / `LPnn_TXR.ZED` (51-83), per ZDB (web R125 R125.2; it read "`LPnn_TXR.ZED` per ZDB"). `dlgLoad.rdr`: LoadingPicture (UIVAR load_picture), PROGRESSBAR Load_progress, mission_title/description, `_2000_ToReturn_MSG`, `loading_CD.tif`; ON_LOAD_COMPLETE, MP_VERSION_NUMBER_ERROR, TRIANGLE -> exit_load_screen; rank strings 2001-2005; **no zanim set named dlgLoad.rdr exists** in UIZANIM, EXTZANIM or MPZANIM, and none of its six animations is defined there (*PLAT-06*); they are in each map's own `LDZANIM.ZAR` (web R125 R125.3) | `A_ready009..020`, `A_ready012.png`; web R91 §18.4; web R96 §7 (`tools/dump-dialogs.ts --dialog dlgLoad.rdr`; the PROGRESSBAR is `load_progress_filling` showing UIVAR `Load_progress`) |
| N16 | Round end `dlgMultiplayerRound` (+5 to winners, +1 to the living, 5 s countdown, 90 s timeout -> dlgNetError); match end `dlgMultiplayerFinal` (10 s) -> `dlgMultiplayerFinalReally` (GAME COMPLETE / FINAL TOTALS / MVP / YOUR STATS; `ClanSwapSidesIndex`+1) -> dlgGameLobby, everyone not ready | web R91 §9, §18.2-18.3 (D:L76078-76082, L76134-76165) |
| N17 | Logoff: TRIANGLE -> "You will be logging off... sure?" (793) -> YES -> `LoadExecPS2 ... --menu_state dlgAfterErrorReboot.rdr` -> main menu | KNOWN [logoff-relaunch]; `s17_q2_logoff/online1/20_then_01..03`, `final.png` |
| N18 | EDIT NETWORK CONFIGURATIONS loads `SCUSNGUI.ELF` (Add/Edit/Delete Setting, Test Connection; `A_08`..`A_26`) and returns through a reboot (`A_29`); config saved to the card as `BWNETCNF`/`net000.cnf`; `SCUSNGUI.ELF` and `NETGUI/` are on the disc | PC research 18:153-160 |
| N19 | Text chat: R1 opens it in the briefing room and the game lobby; lines "name (All): text" cross between clients; display limits name 0x20, message 0x40, records 0x80 | PC research 66 §1, §3-4; KNOWN [chat-recv-wrap] |
| N20 | The console draws online screens ~7% narrower inside PCSX2's 640x448 window; **ours is pixel-exact**, so recomp captures are the pixel reference | KNOWN [online-7pct] |
| N21 | Persona connect errors 543-548; join errors 418, 423, 424, 425-427, 440, 441, 443, 524, 525, 1441 (map not installed) | UIMnLOC |
| N22 | SOCOM Legacy today: one `Room` per map and rules over WebSocket (`packages/match/src/server.ts`, `room.ts`); team rule `viewer/src/net/lobby.ts`; vote kick and idle kick; an "Online" setting and name field in an HTML panel (`viewer/src/online.ts`, `main.ts:1104`); PLAYERS ONLINE and per-map counts (`playersOnline.ts`); scoreboard (`scoreboard.ts`, game details "LAN game"); round screens with placeholders (`roundScreens.ts`); s5: the ARMORY as the lobby's stand-in ("no Game Lobby", W5.R1). No persona, DNAS, universe, online menu, rooms, game list, create game, play list, chat (the `chat` server event is declared, never sent: `net/protocol.ts:487`), voice, friends, ignore, clans or ranks | files named; s5 `docs/plans/2026-09-30-web-sprint-5-armory.md:16-20` |

## Tasks

### ONL-01 -- Online entry: card slot and LOGIN TO SOCOM II ONLINE (`dlgNetLogin`)
- **Goal:** ONLINE from the main menu shows the card-slot popup, then `dlgNetLogin` exactly as the original.
- **What the original does:** M4: ONLINE -> `do_multi_or_medius` -> `dlgMPswitch` -> `dlgNetLogin` (a reading, PLAT-06).
  N4 (`A_30`, `A_31`: LOGIN, SELECT NETWORK CONFIGURATION "1 Setting 1", MEMORY CARD slot 1,
  HARDWARE "SCE/Ethernet (Network Adaptor)", SELECT MEMORY CARD slot, EDIT NETWORK CONFIGURATIONS; `A_05`: no-config
  popup, UIMnLOC 578/581); captions 559-586; N5 (the recomp's version); with an unformatted slot 2, a "not formatted"
  notice (`D:/socom_archive/parity/netcfg1..7`).
- **Today:** `dlgNetLogin` drawn and answering as the original (2026-10-03, pending review; web research 144): the eight
  NetCnf rows (`packages/ui/src/screens/netLoginCommands.ts`) over the page's card (`packages/viewer/src/netLoginHost.ts`,
  OT.R3's first-use write on slot 1), the lists' rows from `NETCNF_DB` (`listbox.ts`), the walk replayed from the
  dialog's ANIMATIONS on the disc (`netLoginDisc.test.ts`), the page's banks and captions (`frontEndAssets.ts`); scored
  (OT.R4, `tools/test/netLoginScore.test.ts`): 99.8 against `A_31` corrected, 99.8 the rows, 94.4 the title crop, 99.4
  the recomp's frame outside the state bands -- not pixel-exact (N20; research 144 §7 says why); the fix round of
  2026-10-03 (research 144 §3, §4, §5): the rebuild's `ON_UPDATE_UIVAR` bindings, the NetCnf selection held on the
  session (`FrontEndSession.netLogin`), `FRONT_END_TEXTURES_PLACEHOLDER` retired. The card-slot popup
  (`A_30`) is the boot path's, owed to OPT-05i. Since OT.R20 (2026-10-04, research 144 §10) LOGIN's connect -- the
  popup between CROSS and the DNAS screen -- stands 3 s more by the owner's pacing
  (`LOGIN_CONNECT_HOLD_SECONDS_PLACEHOLDER`: `NetCnfUnInit` after a successful select answers "not done" 90 ticks): the
  DNAS screen is built 23 + 90 frames after CROSS (23 before); the original's own stage ran about 1.3 s.
- **Gap:** the popup, the dialog, the configuration rows and the eznetcnf answer.
- **Acceptance:** frames compared to our recomp's `00_login.png` (pixel-exact, N20) and the title crop
  `scripts/parity/refs/login.png`; against `netcfg1/01_after_continue.png` and `netcfg2/01_2_DOWN.png` per OC-1's
  choice; the cursor walk over the rows replayed from the dialog's ANIMATIONS in a unit test.
- **Proven by:** ONL-32 (`netcfg*` provenance and the slot popup).
- **Dependencies:** PLAT-05..PLAT-16, PLAT-25, PLAT-04, MENU-02a, ONL-01a. **Size:** M. *([2026-10-02, OT.R6] it
  read "MENU-02": LOGIN needs the menu, not its streams (MENU-02a); the saved configuration it reads is ONL-01a.)*
- **Unknowns:** which dialog draws the "Select MEMORY CARD slot" popup (`A_30`): `dlgMPswitch` itself, or a card popup
  of `UIMemCardAnim` with `dlgMPswitch` a LAN/online switch -- a read of `dlgMPswitch.rdr` and its set (PLAT-06's
  chapter); whether `_573_CheckingAdapter`/`_574_NoAdapterDetected` ever show -- a script read; whether
  `netcfg1..7` are PCSX2 or ours (they show "No NETWORK CONFIGURATION", which the recomp's HLE should never produce) --
  the run logs beside them.
- **Owner calls:** **OC-1** -- mirror the recomp (empty list / always a valid "Setting 1", no notice) or the console
  (a `BWNETCNF` file on the simulated card, a synthetic configuration).
- **[2026-10-02, OT.R3]** **OC-1 is ruled the console's way** (the owner: "start the online section with a saved
  memory card representation that connects to our server"): LOGIN shows a configuration saved on the virtual card,
  naming our central server, as the original shows a saved one ("1 Setting 1", the MEMORY CARD slot, the HARDWARE
  line); a card with none gets it written at first use. The file is ONL-01a's; the settings behind it are not built
  (ONL-02).
- **[2026-10-02, OT.R4]** **LOGIN must match the original** (the owner: "The DNAS and Login screen is important and
  must match the original"): built to the reading level from its record and set, then **scored** against the archived
  LOGIN captures -- `00_login.png` (ours, pixel-exact, N20), `A_06`, `A_30`, `A_31` and the crop
  `scripts/parity/refs/login.png`. Under OT.R3 the configuration rows are the console's (`A_31`), not the recomp's
  empty list (N5): those rows are scored against `A_31` with the 4:3 correction (KNOWN [online-7pct]), the rest of the
  frame against `00_login.png`; `netcfg1/01_after_continue.png` and `netcfg2/01_2_DOWN.png` (OC-1's other branch) are
  not the reference.
- **Merged from:** online front end ONL-01; options OPT-20.

### ONL-01a -- The saved network configuration on the virtual card (OC-1 ruled the console's way)
- **Slice of:** ONL-01 ([2026-10-02, OT.R3, OT.R6]; the online-path plan, `../plans/2026-10-02-online-path-target.md`):
  the configuration ONL-01's gap names ("the eznetcnf answer"), ruled the console's way -- "start the online section
  with a saved memory card representation that connects to our server" (the owner, 2026-10-02). It is ONL-01's card
  half, split out so that the card's data is built and tested before the screen.
- **Goal:** LOGIN reads a saved network configuration from the virtual card, as the console reads the one Sony's
  set-up program saved, and that configuration names our central server; a card with none gets it written at first use
  (OT.R3).
- **What the original does:** N18 -- EDIT NETWORK CONFIGURATIONS (`SCUSNGUI.ELF`) saves the configuration to the card
  as `BWNETCNF` / `net000.cnf` (PC research 18:153-160); N4 -- LOGIN shows SELECT NETWORK CONFIGURATION "1 Setting 1",
  MEMORY CARD slot 1, HARDWARE "SCE/Ethernet (Network Adaptor)" (`A_31`), and with no configuration the no-config popup
  (`A_05`, UIMnLOC 578/581); N5 -- the recomp's eznetcnf HLE answers "Setting 1" on that hardware with the link up,
  without reading the card (`third_party/ps2recomp/ps2xIOP/src/modules/eznetcnf.cpp:1-45`).
- **Today:** none. *(2026-10-02: `packages/card/src/netcnf.ts`, pending review; research 136 -- the `BWNETCNF` folder's
  six files at the sizes a card lists, our JSON naming our server, written at first use and read back as `NetCnfOpen`
  builds LOGIN's rows, over PLAT-26a's libmc; the selected row and the screen are ONL-01's.)*
- **Gap:** the configuration as a file in PLAT-25's file table under the original's names (their nominal sizes a named
  unknown until read), its `data` our JSON: the setting's name as LOGIN lists it, the hardware line, and our server;
  the answer LOGIN's configuration rows read, from that file; the write at first use when the slot holds none. Not
  built (OT.R3, "can skip some of the DNS settings since we have a central host"): DNS and address entry, the other
  settings Sony's program keeps, and the program itself (ONL-02's row leads to PLAT-28's screen).
- **Acceptance:** CI: a slot without the file gets it at first use, and the slot's free space falls by its nominal
  size; a slot with it is read and not rewritten; the rows LOGIN builds from it carry "1 Setting 1", the MEMORY CARD
  slot and the HARDWARE line as `A_31` reads (the text here; the frame is ONL-01's score, OT.R4).
- **Proven by:** ONL-32 (a card holding a configuration, its files listed).
- **Dependencies:** PLAT-25. **Size:** S. **Then:** ONL-01.
- **Unknowns:** the names and nominal sizes of the configuration's files on a PS2 card (PC research 18 names
  `BWNETCNF` and `net000.cnf` only) -- a card that holds one, listed with the dev tool under `tools/` (ONL-32's window,
  or the owner's PCSX2 card); whether the first-use write is shown to the player -- the original never writes it from
  the game, and OT.R3 rules the write, not a screen: nothing is drawn for it until that is ruled; whether `A_05`'s
  no-config popup can still appear (a slot with no card) -- ONL-01's read of `dlgNetLogin`'s set.
- **Owner calls:** **OC-1 -- ruled [2026-10-02, OT.R3]** the console's way: a configuration file on the simulated card,
  naming our server.
- **Merged from:** split from ONL-01 by OT-0 (2026-10-02, OT.R3, OT.R6).

### ONL-02 -- EDIT NETWORK CONFIGURATIONS, as a desktop-only row
- **Goal:** the row exists and leads to PLAT-28's screen.
- **What the original does:** N18.
- **Today:** the row's hook on PLAT-28's screen (2026-10-03, pending review; web research 145): `ONL_02_HOOKS` --
  CROSS on `dlgNetLogin`'s `configureBtn` opens the screen in place of `launchNTGUI2` (`SwitchMenu(SHUTDOWN)`), appended
  to `DESKTOP_SCREEN_HOOKS` so the page holds it; PLAT-28's harness over the real LOGIN with ONL-01's rows
  (`netLoginDesktopHook.test.ts`): CONTINUE lands on LOGIN with the cursor on the row, nothing changed against the
  twin. The read of `dlgReturnFromNTGUI2` (904 B): the original's return rebuilds LOGIN, whose ONSTART lights LOGIN
  when a configuration is loaded (`ONL_02_RETURN_FOCUS_READING`) -- not the row (research 145 §3).
- **Gap:** the LAN flow's `dlgReturnFromNTGUI2LAN` (paused, OT.R5); the return path's `intro_onstart` (OPT-05i / OPT-05a).
- **Acceptance:** the row's caption and position match `A_06`; selecting it shows the screen; returning lands on LOGIN
  with the cursor on EDIT NETWORK CONFIGURATIONS (a test pins it).
- **Dependencies:** ONL-01, PLAT-28. **Size:** S.
- **Unknowns:** where the original's cursor sits after `dlgReturnFromNTGUI2` -- a read of that set (904 B).
- **Owner calls:** confirm this is a "cannot exist in a browser" option (it is Sony's program, not zEngine).
- **[2026-10-02, OT.R3]** **Not built: the desktop-recompilation screen.** The settings behind this row -- Sony's
  network set-up program (N18), DNS and address entry -- are not built ("can skip some of the DNS settings since we
  have a central host", the owner): the row exists, drawn as `A_06` draws it, and leads to PLAT-28's screen, as above.
  The configuration LOGIN shows is the saved one of ONL-01a. The owner's words answer this block's owner call for now.
- **Merged from:** online front end ONL-02; options OPT-19 hook (2).

### ONL-03 -- The DNAS screen (`dlgNetAuthenticate`)
- **Goal:** show what the original shows on the way to the universe list, with authentication always succeeding.
- **What the original does:** N7.
- **Today:** the screen from its record and set, drawn and running at the reading level, pending review (2026-10-03, web
  research 146): `packages/ui/src/screens/dnasCommands.ts` -- `InitNetwork`, `DNASAuthenticate`, `DMEInit`,
  `MediusInit`, `GetServerList` (the first and last as polled workers, the stand-in job until ONL-04's list;
  `DNASAuthenticate` done on the first tick as `socom2_DnasTickDone`), registered on the page by `frontEnd.ts`; the set
  replayed in `packages/ui/test/screens/dnasScreen.test.ts` (CI, the transcription) and `dnasScreenDisc.test.ts` (the
  disc's own set): the captions #448/#534, #535, #536/#537 in the set's order, the logo's fade, SELECT UNIVERSE built
  82 ticks (2.74 s) after the DNAS screen (the build on tick 1, the next on 83). Its score is owed to H70's capture
  (`golden-manifest.json` `state.dnas-connecting-authenticating`); the error dialogs are never shown (OT.R4; research
  146 §4). Since OT.R20 (2026-10-04, research 146 §9) `DNASAuthenticate` answers "in progress" for 90 ticks before the
  bypass's done (`DNAS_HOLD_SECONDS_PLACEHOLDER`, 3 s, the owner's pacing): AUTHENTICATING DNAS DATA stands, SELECT
  UNIVERSE is built on tick 173 (5.74 s); the hold at 0 gives the 83 above. H70's capture is deferred by the owner.
- **Gap:** the screen, with DNASAuthenticate answering done on the first tick as `socom2_DnasTickDone` does.
- **Acceptance:** a capture of our recomp passing through this screen, compared frame by frame (captions, logo,
  timing); the dialog's set replayed in a test with DNASAuthenticate done on the first tick.
- **Proven by:** ONL-32 (the 1 frame/s capture LOGIN -> SELECT UNIVERSE).
- **Dependencies:** PLAT-07, PLAT-10. **Size:** S.
- **Unknowns:** whether the screen is visible at all under the bypass (the s4 capture skipped `A_32`/`A_33`; none
  exists) and the caption order -- a 1 frame/s recomp capture from LOGIN to SELECT UNIVERSE plus the set read.
- **Owner calls:** whether the DNAS error dialogs (1105-1144) are ever shown (under the bypass: never).
- **[2026-10-02, OT.R4]** **The DNAS screen must match the original** (the owner: "The DNAS and Login screen is
  important and must match the original"). Authentication always succeeds; what must match is what the player sees --
  the captions, their order, the logo, the timing. No archive holds its frames (`A_32`/`A_33` were skipped), so its
  capture is an owner's window, [HUMAN_TASKS H70](../HUMAN_TASKS.md): a 1 frame/s capture from LOGIN TO SOCOM II
  ONLINE to SELECT UNIVERSE, on PCSX2 and on the recomp. Until it runs the screen is built to the reading level from
  its record and set, and its score is owed to its manifest row (`docs/parity/golden-manifest.json`; W9.R8), never met
  by another screen's frame.
- **Merged from:** online front end ONL-03.

### ONL-04 -- SELECT UNIVERSE (`dlgNetServerSelect`)
- **Goal:** the universe list with name, ONLINE dot, USERS/MAX USERS and UNIVERSE NEWS scrolled with L1/L2.
- **What the original does:** `A_34_universe.png` (one universe, `ping_dot_green`); captions 609-614; Horizon's MUIS
  answers LobbyExt 0x03 with 0x04 entries (server/README `5fcb9dc4`).
- **Today:** *(2026-10-03, ONL-04, pending review; research 147.)* `packages/ui/src/screens/universeCommands.ts`: the
  query `GetServerList`'s worker sends (InfoType 3) and the client's two lists its replies fill -- SERVER_LIST's rows
  (name, `status word == 0`, users, max users) at the entries' end, the news never cleared -- and the screen's two rows,
  `UpdateServerInfo` (SERVER_NEWS as description, a blank line and the news; SERVER_NAME) and `LobbyDisconnect`;
  `listbox.ts`: the list's UIVAR rebuilds its items (`FUN_003754d0`, correcting research 117 §13.1), an IMAGE column's
  `ping_dot_green` / `ping_dot_red` by the cell's value; the match server answers `POST /texts/universe` from SVC-05's
  `texts.json` when `main.ts` has `DATA_DIR`; the page asks it (`packages/viewer/src/universeHost.ts`; `frontEnd.ts`), a
  deep link reading the list first. Held by `universeScreen.test.ts` (the machine over the disc's layout and set, CI on
  the fixtures), `universeAnswer.test.ts` (the server over a `texts.json`). The frame's score is met
  (`tools/test/universeScore.test.ts`, dev host, sprint 11's close): 98.9 against `A_34` (4:3 corrected; control 72.9),
  99.0 with the row lit, 95.3 on the title crop `refs/universe.png` (control 80.0); the one visible difference is the
  texts, the placeholder's (H73). ONL-04's first run (72.9, the black control) predates the page's drawing.
- **Gap:** the screen; the data from SVC-05.
- **Acceptance:** compared to `01_universe.png` (ours), `A_34`, the crop `refs/universe.png`; the server returns the
  MUIS reply's fields.
- **Dependencies:** SVC-05, PLAT-05..PLAT-15. **Size:** S.
- **Unknowns:** Sony's universe names and news (nothing on disk records them).
- **Owner calls:** the universe name and news text for our server.
- **Merged from:** online front end ONL-04.

### ONL-05 -- DOWNLOAD PATCH (`dlgDownloadPatch`)
- **Goal:** decide whether and how the universe's update prompt exists.
- **What the original does:** PSRewired's universe offers the r0004 update on connect; the client fetches `APACHE00.ZDB`
  over sceHTTP (KNOWN [r0004-path], [r0004-rebuild]; `logs/parity/pcsx2_psrewired_url/A_U_08_connect.png`).
- **Today:** none.
- **Gap:** the owner's call, then the screen or nothing.
- **Acceptance:** per the call; if shown, compared against `A_U_08_connect.png`.
- **Dependencies:** none (OC-2 is ruled first). **Size:** S (a screen) or none. **Then:** BOOT-11.
- **Unknowns:** the dialog's captions (no `_MSG` found in it) -- read its layout and set.
- **Owner calls:** **OC-2** -- is SOCOM Legacy r0001 (no patch, as on our Horizon) or does it present r0004 behaviour?
  *(Ruled 2026-10-04, the online path's plan OT.R17: no patch prompt for now -- r0001; nothing is built. Amended
  2026-11-01 by OT.R97: r0004 is the specification for gameplay and front-end behaviour, the download path stays
  excluded, so nothing is built here still; `plans/r0004-option-b.md`.)*
- **Merged from:** online front end ONL-05.

### ONL-06 -- CONNECT TO SOCOM II: the persona form and list (`dlgNetPlayerName`)
- **Goal:** the persona form and list exactly as the original.
- **What the original does:** rows PLAYER NAME, PASSWORD, SAVE PASSWORD YES/NO, HOMETOWN, GENDER, CONNECT (`A_35`); the
  list (`A_36`) shows three "<New Persona>" entries with CROSS SELECT, CIRCLE DELETE (603 warning), TRIANGLE CANCEL; a
  saved persona prefills the form and moves the cursor to CONNECT (KNOWN [persona-headless]); captions 587-608; name cap
  14, password cap 12 (PLAT-17).
- **Today:** *(2026-10-04, ONL-06, pending review; web research 153.)* the form and the list drawn and answering from
  the dialog's record and set: `packages/ui/src/screens/personaCommands.ts` -- the client's account list (`AcctDb`,
  keyed by HOST, PORT and NAME) and ten rows (`UpdateAcctInfo`, `GetMUISPersonaInfo`, `DeleteMUISPersona`,
  `MUISPersonaExists`, `CompareValues`, `PruneUIVarSpaces`, `NetCensorText`, `LobbyLogout`, and SELECT UNIVERSE's CROSS:
  `VerifyPatchLevel`, `LobbyConnect`'s form half) -- on the page through `packages/viewer/src/personaHost.ts`: the list
  read from and written to the virtual card through `packages/card`'s `PersonaCard` at the set's own `SaveConfig`
  (OPT-05i's rows, registered here), **the name and the form's other fields, never a password** (OT.R17;
  `SAVE_PASSWORD_YES_NOT_HONOURED_PLACEHOLDER`). Held by `personaCommands.test.ts`, `personaScreen.test.ts` (the machine
  over the disc's layout and set, CI on the fixtures: the list's three rows, CROSS / CIRCLE with #603 / TRIANGLE, the
  caps 14, 12 and 20, the prefill and the cursor, CONNECT's and TRIANGLE's dispatch, the way in from SELECT UNIVERSE),
  `packages/viewer/test/personaHost.test.ts` (the card). Scored (`tools/test/personaScore.test.ts`, dev host): 99.8
  against `A_35`, 99.9 `A_36` (99.7 its panel), 99.1 `A_37`, 99.8 `A_38` and `A_39`, 99.6 the recomp's `02_persona.png`
  (55.08 % of its pixels equal), 96.9 the title crop. Not built: the connection behind `LobbyConnect` (ONL-07;
  `LOBBY_CONNECT_PLACEHOLDER`), SAVE PASSWORD: YES's remember token (R7), OC-3's HOST (`PERSONA_HOST_PLACEHOLDER`).
  The old free-text name in the panel (`main.ts`, `s2u.mp.name`, cut to 30 by `net/lobby.ts`'s NAME_MAX) is the map
  viewer's and untouched; its migration needs a ruling (research 153 §7).
- **Gap:** the screens over OPT-04's records. The PASSWORD row, prefilled from a saved persona, holds the server-issued
  credential (R4, 2026-10-01; OPT-04, SVC-03) and is drawn masked as the original masks a password; a typed password
  is sent once to the service (SVC-03) and never stored. **Corrected by R7 (the owner, 2026-10-01):** unchanged in
  look -- the persona form exactly as the original, the password row masked as the original masks it, the SAVE
  PASSWORD row drawn as the original draws it. The account is a plain name and password (SVC-03); there is no
  credential on the card. **The PASSWORD row's source is ruled** (R7's §7 item 5, the owner, 2026-10-01: "agreed on
  cookie"): on a persona saved with SAVE PASSWORD: YES the masked row is drawn from the **password's length** the
  record keeps (OPT-04), and the login presents the remember token's HttpOnly cookie, not a password (SVC-03); the
  page never holds the password or the token. The accepted deviation: a saved password cannot be edited character by
  character -- opening the keyboard on that row starts empty. With SAVE PASSWORD: NO the row is empty and the keyboard
  opens at every login, as on the original.
- **Acceptance:** against `02_persona.png` and `A_35`..`A_38`; field caps tested at 14 and 12; the prefill path compared
  to KNOWN [persona-headless]'s run; a prefilled credential drawn masked (OPT-04's unknown on a value past the
  12-character cap settles how many mask glyphs). *(R7, 2026-10-01: no credential is prefilled; a typed password is
  drawn masked within the 12-character cap; a saved persona's row shows as many mask glyphs as the stored length, and
  the keyboard opened on it starts empty.)*
- **Dependencies:** PLAT-17, OPT-04a, SVC-03. **Size:** M. *([2026-10-02, OT.R6] it read "OPT-04": the form draws
  the records OPT-04a writes, without the parked options save.)*
- **Unknowns:** whether three entries is a maximum -- a script read or a card with three personas; HOMETOWN and GENDER
  caps -- the dialog's GetTextInput blocks. *(Answered 2026-10-04, research 153 R153.3-R153.4: the three rows are a
  pad -- `FUN_00276af0` adds `<New Persona>` rows up to three, and that row is the only way to the name keyboard, so
  the form makes at most three personas a server while the account list itself has no cap; HOMETOWN is 20 characters /
  63 bytes, empty allowed; GENDER has no keyboard: CROSS flips Male / Female.)*
- **Owner calls:** **OC-3** -- what HOST the browser stores (shared with OPT-04). The password on the card is ruled
  (R4: a server-issued credential). *(R7, 2026-10-01: R4's ruling is replaced; SAVE PASSWORD: YES is **ruled**: a
  remember token in an HttpOnly cookie, the record keeping the password's length, OPT-04, SVC-03.)*
- **Merged from:** online front end ONL-06.

### ONL-07 -- Connect and authenticate (`dlgNetConnect`) and its error dialogs
- **Goal:** CONNECTING TO SOCOM II ONLINE -> the write-down warning -> the card-save prompt -> the next screen, with
  every error dialog. *(Corrected 2026-10-05, ONL-07, web research 153 §7 and 157: the order is the write-down warning
  (#606) and the card-save prompt (#831) **first**, on the persona form -- `register_new_account` runs both before its
  `SWITCHMENU(dlgNetConnect.rdr)`, so a name the service then refuses is already saved -- then CONNECTING TO SOCOM II
  ONLINE with its error dialogs, then USER AGREEMENT.)*
- **What the original does:** `A_41` (606), `A_42` (save YES/NO); errors 543-548 (N21); our Horizon auto-creates
  accounts (`CreateAccountOnNotFound=True`, server/README).
- **Today:** *(2026-10-05, ONL-07, pending review; web research 157.)* the connecting screen drawn and answering
  from its record and set, over the client's lobby object transcribed from the decompilation
  (`packages/ui/src/screens/lobbyClient.ts`: the session flag, the state byte and its queue behind the valve
  `socom_online_state`, the connect and its MP_SUCCESS -- found at SessionBegin's reply, D:L190919 -- the login, the
  registration, the logout) and its two rows (`connectCommands.ts`: `LobbyLogin`, `LobbyRegister`), on the page through
  `packages/viewer/src/connectHost.ts` over SVC-03's `/account/login`, `/account/create` and `/account/logout`
  (`LOBBY_CONNECT_PLACEHOLDER` retired there). Each failure shows its dialog and returns to the persona form
  (`exit_connect_screen` is `SWITCHMENU(PREVIOUS_SCREEN)`): -978 #545, -997 #543, the name filter #544, any other
  status "Login Failure" then #515, 90 s unanswered #547 then #515; -998 the set's own question "Player Name not
  found. Would you like to register this Player Name?" and, on YES, the registration and a second login; #546 is
  started by nothing and #548 named by no dialog (N21 corrected). A success writes "STATE: LOGGED IN", holds the
  profile download's 3 s and a second, and switches to USER AGREEMENT with `UsagePolicyReturnScreen` 1 (the set's own
  write), whose ACCEPT lands on `dlgWorldOfSOCOM.rdr`. The typed password is dropped from the page's memory when the
  login is answered or the screen is left (OT.R17); the session's ticket is kept in the lobby client's memory only
  (`FrontEndSession.lobby.ticket()`: the seam for ONL-09 on). Held by `lobbyClient.test.ts`, `connectCommands.test.ts`,
  `connectScreen.test.ts` (the machine over the disc's layout and set, CI on the fixtures),
  `packages/viewer/test/connectHost.test.ts`, `frontEnd.test.ts`. Scored (`tools/test/connectScore.test.ts`, dev host):
  the write-down notice 99.8 against `A_41` and 99.6 against the recomp's `07_after_connect.png` / `07_write_down.png`,
  the save prompt 99.9 against `A_42`, and the connecting screen 99.8 against two recomp frames of it found in the
  archive (research 113 had recorded none). Not built: the remember token (R7; `savePassword` is always false), the
  name filter (SVC-23; `NAME_FILTER_PLACEHOLDER`), the profile's file service (`CharacterProfile` stays PLAT-34's);
  **the match server on this base does not mount `/account/*`** (SVC-07a's; research 157 §6), and SVC-03's login does
  not create an unknown name -- the client's own register question does. The error dialogs' frames are owed to ONL-32.
- **Gap:** the screens; the errors from SVC-03; on CONNECT, the typed password (if any) goes once to the service over
  TLS and the credential it returns is what the card-save prompt (`A_42`) writes (OPT-04, R4). **Corrected by R7
  (2026-10-01):** on CONNECT the name and password go to the service over TLS (SVC-03) -- or, for a persona saved
  with SAVE PASSWORD: YES, the remember token's cookie -- and nothing is returned to the card; with YES the service
  sets the cookie; the card-save prompt (`A_42`) writes the persona record (OPT-04) with SAVEPASSWORD and the
  password's length, never the password.
- **Acceptance:** captures `07_after_connect.png`/`07_write_down.png` and `A_41`/`A_42`; each error forced on the local
  service and compared with a recomp capture of the same error.
- **Proven by:** ONL-32 (each error forced on the local service).
- **Dependencies:** ONL-06, SVC-03, OPT-05i. **Size:** M. *([2026-10-02, OT.R6] it read "OPT-05a": the card-save
  prompt and its slot select are OPT-05i's slice of the card script set.)*
- **Unknowns:** whether a new persona sends `MediusAccountRegistrationRequest` or Login -- a debug-level Medius log of
  one login (SVC-02). *(Answered 2026-10-05, research 157 R157.4, from the client's code: Login first; on -998 the
  set asks, and YES sends the name filter, the registration, then Login again.)*
- **Owner calls:** the registration rules for questionable names (the original's are unobservable). *(Asked back by
  the owner 2026-10-04, HUMAN_TASKS H85; meanwhile: the caps and the keyboard's characters only, a taken name with a
  wrong password refused; OT.R17.)*
- **Merged from:** online front end ONL-09.

### ONL-08 -- USER AGREEMENT (`dlgUsagePolicy`)
- **Goal:** the agreement fetched from the server, ACCEPT/DECLINE, decline disconnecting.
- **What the original does:** `A_43` (d-pad scroll; persona name at the bottom); 756-763; text from
  `MediusGetPolicyRequest` (`MLS.cs:401`); Horizon serves "EULA".
- **Today:** *(2026-10-04, ONL-08, pending review; web research 156 §1)* the dialog runs from its record and set:
  `GetUsagePolicy` (`FUN_002797c0` -> `FUN_002f79f0`) asks SVC-05's `POST /texts/policy` (`usagePolicyCommands.ts`,
  the page's `usagePolicyHost.ts`, registered by `frontEnd.ts`), the chunks joined into UsagePolicy as `FUN_002f7ac0`
  does; the d-pad scroll, the persona's name from `PLAYERNAMEVAR` (ONL-06 writes it), ACCEPT -> `dlgWorldOfSOCOM.rdr`
  (`UsagePolicyReturnScreen` 1) or PREVIOUS_SCREEN, DECLINE -> #763 -> the chain and the reboot (`LobbyLogout` stubbed
  with its cited answer for ONL-10); replayed over the machine (`usagePolicyScreen.test.ts`). Scored
  (`usagePolicyScore.test.ts`): the chrome 99.5 against `08_eula.png`, 99.7 against `A_43` (4:3), the title crop
  95.9, met; the text region alone 85.6 / 85.2, not met -- the placeholder text by OT.R17 (H73). Open: the arrival
  focus (the ring starts on `teletype_plate`; the captures show ACCEPT lit; research 156 §1.6, PLAT-11's), so on the
  page only a tap or click reaches ACCEPT; the decline path's capture (ONL-32).
- **Gap:** the screen; the text from SVC-05.
- **Acceptance:** compared to `08_eula.png`/`A_43`; the decline path compared to a recomp capture.
- **Proven by:** ONL-32 (the decline path).
- **Dependencies:** SVC-05. **Size:** S.
- **Unknowns:** the original agreement text (not on disc).
- **Owner calls:** our agreement text.
- **Merged from:** online front end ONL-10.

### ONL-09 -- The SOCOM II ONLINE menu (`dlgWorldOfSOCOM`)
- **Goal:** the menu with every row, help line, popup and page, exactly as the original.
- **What the original does:** N6; SERVER NEWS popup at login (779-780, `A_44`); MESSAGES: "News of the day" plus "Clan
  messages" (775, 781); NO INVITATIONS <-> INVITATIONS (476, 794); REFRESH LIST (790); AUTOPLAY fields 770-772.
- **Today:** the menu drawn and answering from its record and set (2026-10-03, pending review; web research 158): the
  eleven rows with their help lines and panes, the walk replayed from the dialog's ANIMATIONS
  (`packages/ui/test/screens/worldOfSocomScreen.test.ts`, CI on the fixtures); SERVER NEWS once a launch
  (`PopupNewsOnce`, a valve of `global_valves.rdr`) and MESSAGES from one text, MEDIUS_MOTD, filled by
  `GetMediusAnnouncements` (`packages/ui/src/screens/worldOfSocomCommands.ts`) over SVC-05's `/texts/announcement` --
  empty on a fresh server (H73); NO INVITATIONS from SVC-09a's rows, mounted on the session
  (`packages/viewer/src/worldOfSocomHost.ts`); the name at the foot from `GetClan`'s no-clan reply (PLAYER_NAME_AND_TAG);
  AUTOPLAY's pane with #783 typed by its TELETYPE; BRIEFING ROOMS and REFRESH LIST run, the room list empty until
  ONL-11 replaces `RefreshRoomList`'s stub; the eight rows whose pages are parked are inert (a binding gate, OT.R8);
  no medal -- the ladder is parked, its decode ONL-34's; logoff's popup as registered today (ONL-10). Scored
  (`tools/test/worldOfSocomScore.test.ts`): chrome 99.7 / 99.9 (`09_lobby`, `A_44`) and 99.5 / 99.8
  (`09_lobby_no_news`, `A_45`); the news text and the medal apart and not met (the text 99.1-99.8 with each
  capture's own announcement served). One capture per row of the walk stays owed to ONL-32.
- **Gap:** the 31 KB dialog and its pages.
- **Acceptance:** one capture per row from the menu walk (PC research 80-online-menus §4 item 1, not yet run; ONL-32)
  compared to SOCOM Legacy; today `A_44`, `A_45` and `09_lobby*.png` exist.
- **Proven by:** ONL-32 (the menu walk, one capture per row).
- **Dependencies:** PLAT-05..PLAT-16, SVC-05, SVC-09a (the invitations row). **Size:** L. *([2026-10-02, OT.R6] it
  read "SVC-09": with clans parked the row needs only the original's answer for a player with no invitation,
  SVC-09a.)*
- **Unknowns:** the pages behind AUTOPLAY, OPTIONS and CLAN as reached from this menu -- the menu-walk capture; whether
  SERVER NEWS and the MESSAGES pane show one text or two.
- **Owner calls:** none.
- **[2026-10-02, OT.R8]** **Rows whose pages are parked are drawn and inert.** On the online path the menu is built
  whole, every row drawn as the original draws it; a row whose page waits on a parked task -- CLAN (ONL-26..ONL-28),
  PLAYER RANKING and CLAN RANKING (ONL-30), FRIENDS (ONL-24), IGNORE (ONL-25), MESSAGES' "Clan messages" band (ONL-29),
  AUTOPLAY (ONL-15), OPTIONS (OPT-15) -- does nothing yet, and that is recorded as owed to its task, never replaced by
  an invented page. NO INVITATIONS is the original's answer for a player with none (SVC-09a). The SERVER NEWS popup
  and MESSAGES' news are SVC-05's texts, on the path.
- **Merged from:** online front end ONL-11; services SVC-07 (the views).

### ONL-10 -- Logoff
- **Goal:** TRIANGLE -> the confirm -> YES -> back to the main menu (the original reboots).
- **What the original does:** N17.
- **Today:** the logoff runs from the disc's own records (2026-10-04, merged at ee8944c2; web research 160): TRIANGLE's
  `exit_lobby` raises #793 with NO / YES; YES stops the music, shows #422 "Logging off", holds on `LobbyLogout`
  (`FUN_0027dcc0`) until the session has ended (`/account/logout` with the ticket; the ticket dropped, the keep-alive
  stopped), runs `UnInitNetwork` -- not "the constant 1": `FUN_0027e5c0` disconnects the lobby, and without it a second
  ONLINE entry could not connect -- and the NetCnf rows, then `SWITCHMENU(REBOOT)` (`packages/ui/src/screens/logoffCommands.ts`,
  mounted on the session by `packages/viewer/src/worldOfSocomHost.ts`). The walk is pinned over the machine
  (`packages/ui/test/screens/logoffScreen.test.ts`), the session's wiring and a second login after the logoff
  (`packages/viewer/test/logoffSession.test.ts`). Not scored against `20_then_00..03` / `final.png` (no browser run).
- **Gap:** the popup and PLAT-10's reboot equivalent into BOOT-10's dialog.
- **Acceptance:** compared to `s17_q2_logoff/online1/20_then_01..03` and `final.png`.
- **Dependencies:** ONL-09, PLAT-10, BOOT-10a. **Size:** S. *([2026-10-02, OT.R6] it read "BOOT-10": the return
  needs `dlgAfterErrorReboot` without the boot, BOOT-10a.)*
- **Unknowns:** BOOT-10's. **Owner calls:** none.
- **Merged from:** online front end ONL-12.

### ONL-11 -- BRIEFING ROOMS list
- **Goal:** the room list with player counts and eligible-rank icons, and JOINING ROOM.
- **What the original does:** N8; JOINING ROOM dots 795-800; `mp_rooms.rdr` (6,648 B); `room_rank_bits` (D:L184790,
  L184824).
- **Today:** none; rooms are per map, chosen in a dropdown (`playersOnline.ts`).
- **Gap:** the screen; the room set from SVC-06; rank icons from SVC-13/SVC-14.
- **Acceptance:** compared to `rooms.png` and `A_47`; rank-icon bits shown per room.
- **Dependencies:** SVC-06, SVC-14a. **Size:** M. *([2026-10-02, OT.R6] it read "SVC-14": the list draws each
  room's rank bits, SVC-14a; the gate that refuses a rank is the parked SVC-14.)*
- **Unknowns:** the original servers' room names, count and rank limits (not on disc); what `mp_rooms.rdr` holds -- read
  it with the repo's rdr parser.
- **Owner calls:** **OC-4** -- our room set. *(Ruled 2026-10-04, OT.R17: the server's default names.)*
- **[2026-10-05, ONL-11]** **The list is built** (merged at 6814e8ef; web research 161): `RefreshRoomList`
  (`packages/ui/src/screens/worldOfSocomCommands.ts`, `FUN_0027daa0` -> `FUN_002e3a30` -> `FUN_002e3aa0`) asks SVC-06's
  `/lobby/channel-list` with the session's ticket as its bearer at the page's own origin
  (`packages/viewer/src/worldOfSocomHost.ts`), keeps the replies as `FUN_002e3b00` does and draws ROOMLISTVAR as
  `FUN_002e3cc0` does -- Horizon's four as Alpha, Bravo, Delta, Charlie, the players, the four medals of the disc's
  `ROOMLIST` IMAGE columns; asked at arrival, every 30 s and on REFRESH LIST; empty and error keep the list as it
  stood; a 401 is the session lost (state 2, `OnMultiplayerDisconnect`). CROSS on a room row is gated
  (`ROOM_JOIN_GATE_READING`): the join chain and JOINING ROOM are ONL-12's. Not done: the capture comparison against
  `A_47` (which shows "Channel 1", not the default names) and `rooms.png`; `mp_rooms.rdr` is still unread.
- **Merged from:** online front end ONL-13.

### ONL-12 -- BRIEFING ROOM (`dlgMPBriefingRoom`)
- **Goal:** the briefing room screen, its game list and every join error.
- **What the original does:** N9, N21; password prompt 423; "Game already started: spectate / ghost?" (352/353); JOINING
  GAME dots 428-439 (id 431 carries an unrelated string on disc).
- **Today:** none.
- **Gap:** the screen over SVC-06's list.
- **Acceptance:** compared to `briefing_room.png`, `A_48`, `B_43`; each error forced on the local service and compared
  to a recomp capture.
- **Proven by:** ONL-32.
- **Dependencies:** SVC-06, ONL-23a, ONL-11. **Size:** L. *([2026-10-02, OT.R6] it read "ONL-23": the room draws
  its chat panel, ONL-23a; text chat itself is the parked ONL-23.)*
- **Unknowns:** the PLAYER LIST page and the ping thresholds for the dots -- recomp captures.
- **Owner calls:** none.
- **[2026-10-05, ONL-12]** **The room is built** (merged at ab7a766c; web research 162): CROSS on a room row runs
  `join_room` -- `CanJoinRoom` (`FUN_0027d690` -> `FUN_002e34e0`), `JoinMPRoom` (0x27d270 -> `FUN_002e3790`: the world
  id, `room_rank_bits`, MEDIUS_LOBBY_NAME, state 19) and the lobby's state 19 (`FUN_002ee290`: JoinChannel; a listed room
  needs no CreateChannel1) over SVC-06's `/lobby/join-channel` with the session's bearer, then the lobby world's filter;
  MP_JOIN_ROOM opens `dlgMPBriefingRoom.rdr` (`packages/ui/src/screens/briefingRoomCommands.ts`,
  `packages/viewer/src/briefingRoomHost.ts`). The room shows its name (`roomname`), #522, and the game list from
  `/lobby/game-list` (`RefreshGameList` -> `FUN_002e2920`, page 1 of 256; the reply `FUN_002e2b00`; the draw
  `FUN_002e2ce0`: B_43's columns, sorted by GameStats byte 6, the client's filters) every 30 s and on REFRESH LIST;
  TRIANGLE leaves by `exit_lobby` (`JoinMPRoom(NONE)`, `/lobby/leave-channel`: `ROOM_LEAVE_ADAPTATION`) to the ONLINE
  menu. A refused join runs `OnJoinRoomFailure` (the text S:0x3f49a0, the room list asked again); a 401 is the session
  lost. Gated: CREATE GAME (`CREATE_GAME_GATE_READING`, ONL-13), a listed game's join (`GAME_JOIN_GATE_READING`,
  ONL-16a, which owns the game-join errors of the goal); parked: GAME DETAILS, PLAYER LIST
  (`ROOM_PLAYER_LIST_PARKED_READING`). Not done: the captures (`briefing_room.png`, `A_48`, `B_43`) and the forced
  errors against the recomp (ONL-32); the console's state 16 between JoinChannel and MP_JOIN_ROOM is skipped
  (`ROOM_JOIN_NO_SECOND_SERVER_ADAPTATION`).
- **Merged from:** online front end ONL-14.

### ONL-13 -- CREATE GAME (`dlgCreateGame`): public and private games
- **Goal:** every row, option list, default and help line; private games via PASSWORD, plus the spectator password.
- **What the original does:** N10; spectator password 252; "You must create a playlist" (PC research 28 §3, wtb5).
- **Today:** rules exist only as the server's `classic`/`respawn` and `room.ts` DEFAULT_OPTIONS; respawn disabled by the
  owner (`server.ts` header); no screen.
- **Gap:** the screen; the created game registered through SVC-06/SVC-07.
- **Acceptance:** compared to `title_create_game.png` and `A_49`/`A_50`/`A_52`; each option's cycle tested against
  strings 244-293; the created game's report compared to N12.
- **Dependencies:** SVC-06, PLAT-17. **Size:** L. **Then:** ONL-14 (the play list).
- **Unknowns:** the RANK RESTRICTIONS editor and the PLAYERS range -- a read of the 33 KB `dlgCreateGame` set.
- **Owner calls:** none.
- **Merged from:** online front end ONL-16.
- *(2026-10-04, the research wave's R2-MN card, `C:/Projects/research-wave-2026-10-04/R2-MN-match-modes-net.md`, not yet
  checked by a second agent): CREATE GAME's ranges -- PLAYERS 2-16 by 2, ROUND TIME 4-10 minutes, ROUND COUNT 3 / 5 / 7 /
  9 / 11; a respawn game forces 20 minutes and one round (OT.R21 refuses respawn for now); the game list sorts by
  `mp_game_sort_order` (127 for a player's game). The vote-out ban is believed 120 minutes (the unit from Horizon's
  `BanMinutes`; SVC-23d).)*
- *(2026-10-05, ONL-13 on `agent/s17-create`, web research 163; reading, merged at 9909796e)* CREATE GAME runs from the disc's
  `dlgCreateGame.rdr` with its own set: the ranges above held against the set by the rig (PLAYERS 2-16 by 2, ROUND TIME
  4-10, ROUND COUNT 3-11 by 2, each wrapping); the first arrival's friendly fire is `global_valves.rdr`'s 0 (RESTORE DEFAULTS
  makes it 1); a private game through SET PASSWORD and the soft keyboard; RESPAWN drawn and disabled at every arrival
  (`RESPAWN_ROW_DISABLED_READING`, OT.R21); CREATE posts CreateGame1's fields to `/lobby/create-game` with the bearer
  (`FUN_002edda0`); -975 shows #294 and stays, any other failure #295 and returns (`FUN_002ee090` D:L190605-190616); a 401
  is the session lost. A success is handed to the game lobby's gate and returns to the caller (`GAME_LOBBY_GATE_READING`,
  ONL-16a's join). The entry: `mountCreateGame` on the session (the briefing room's own `OnCreateGamePress` switches in),
  `openCreateGame` for a stand-in caller. Owed: the captions' and the screen's scores (ONL-32). The page mounts it: `frontEnd.ts` calls `mountCreateGame` on
  the session (with ONL-16a, f6f23a8c).

### ONL-14 -- The map selector (CREATE GAME PLAY LIST)
- **Goal:** the 24-entry list, the preview, selected-list editing, Medley/Random and accept.
- **What the original does:** N11; `title_play_list.png`.
- **Today:** a map dropdown in the HTML panel with player counts (`playersOnline.ts`, `ui.ts`) -- not the original.
- **Gap:** the page.
- **Acceptance:** each of the 24 rows compared to `scripts/parity/refs/map_<slug>.png` (row geometry x 78..292, y
  117+20k, PC research 33); selection and Medley rules tested from the script.
- **Dependencies:** PLAT-15, ONL-13. **Size:** M.
- **Unknowns:** how a multi-map play list rotates after each match (web R91 §18.3: the server "would relaunch the next
  map") -- a two-match capture.
- **Owner calls:** none.
- **Merged from:** online front end ONL-17.
- *(2026-10-05, ONL-14 on `agent/s17-create`, web research 164; reading, merged at 9909796e)* The PLAY LIST is
  `dlgCreateGame.rdr`'s own popup (one dialog with ONL-13; notes 163 and 164). `GetAvailableMPMissions` (`FUN_00274940`)
  lists Medley, Random and the 22 maps of `missionlist.rdr` in order -- the 24 rows; OT.R16's three (Frostfire, Vigilance,
  Crossroads) are selectable and the rest drawn as the LISTBOX draws a row that cannot be taken: the keyed cell's `DISABLED`
  and `COLOR`, the list's own `DISABLED_COLOR` 128 128 128 (`PLAY_LIST_FIRST_RELEASE_READING`). The widget now applies the
  keyed cell, builds `AddItem` with `FUN_0036bbc0` and writes `GetContents` (research 185's reads, re-read), so SQUARE puts
  [[number, name], ...] in PLAYLISTVAR. Owed: the 24 rows' scores against `map_<slug>.png`; the rotation (unchanged).
- *(2026-10-07, the owner's playtest of 2026-10-06; research 164 R164.3, R164.7)* The owner chose the three-map list:
  AVAILABLE MAPS holds only VIGILANCE, CROSSROADS and FROSTFIRE (`missionlist.rdr`'s order), the rest, Medley and Random
  included, left out at the source as the original leaves out a map a game cannot play; every row takes CROSS, SQUARE,
  TRIANGLE and RIGHT and shows its picture, and `add_a_mission`'s row-0 Medley test is retired by one byte
  (`PLAY_LIST_NO_MEDLEY_ROW_READING`). Before that call the 21 not offered were grey `DISABLED` rows that swallowed
  SQUARE, TRIANGLE and RIGHT (and first drew as bright as the offered: 128 is the GS's 1.0).

### ONL-15 -- ONLINE FILTERS and AUTOPLAY (screens)
- **Goal:** the filters page (map type, players, response time, friendly fire, password) and AUTOPLAY's auto-join.
- **What the original does:** `dlgOnlineFilters` (638-672); AUTOPLAY 783-784 ("Automatically join a game based on your
  filter settings"); filter valves GamePlayerFilter, GameSpeedFilter, GamePasswordFilter, FF_FILTER, LockedFilter,
  GameTypeMapIndex (OPT-02); Medius `SetGameListFilter*` (`MLS.cs:2676-2747`); FILTER_BUDDIES, FILTER_CLANAFFILIATION,
  FILTER_CLANONLY (`S:0x3ef1c8`).
- **Today:** ONLINE FILTERS runs from the disc's scripts (web research 265 §2.3): MAP TYPE's cycle with
  `GetMissionInformation` and `NumMultiMissions`, # OF PLAYERS, RESPONSE TIME, the FRIENDLY FIRE and PASSWORD strips,
  RESET, the way back -- each change `OptionsMenuChanged`, saved by ONLINE OPTIONS' RETURN (the card's path; the page has
  no SAVE). The filtering side read (265 §2.1): the console sends only the room's filter (field 10) and AUTOPLAY's
  PLAYER_COUNT >= 1; SVC-06 honours both (as built); the page drops the rest as `FUN_002e3080` does, the game type
  (`FUN_002e31e0`) now included. AUTOPLAY runs: `JoinMPGame(RANDOM)`'s chain, the pick (the roomiest, then the fastest,
  then the first -- `FUN_002f9220`, a reading), the room's join going on to the game's, state 17's
  MP_MEDIUS_READY_TO_CONNECT into `join_game` (265 §2.4). Reading, reviewed 2026-10-10; the proven level ONL-32's.
- **2026-10-10:** ONL-15 (web sprint 22, wave 1; `agent/online-onl15`): research 265 §2; `GAME_TYPE_FILTER_READING`
  retired (research 162 §6); `RANDOM_JOIN_SETTINGS_READING` named; AUTOPLAY's row unparked; the block's `MLS.cs:2676-2747`
  is the pin's own numbering (`MLS.cs:2700-2768` the two `...0` handlers the console sends); FILTER_BUDDIES and its kin
  are `SetFilters`' variables, which no script on the disc calls (265 §2.5).
- **Gap:** ~~the two pages; the filtering in SVC-06~~ built 2026-10-10 (ONL-15, above); left: `RANDOM_JOIN_SETTINGS_READING`
  and the proven level (ONL-32).
- **Acceptance:** recomp captures of both pages compared; the filtered list for a seeded game set matches the recomp's.
- **Proven by:** ONL-32.
- **Dependencies:** SVC-06, OPT-02. **Size:** M.
- **Unknowns:** client- or server-side filtering; AUTOPLAY's pick rule -- a local-stack log plus the script read.
- **Owner calls:** none.
- **Merged from:** online front end ONL-18.

### ONL-16 -- GAME LOBBY (`dlgGameLobby`)
- **Goal:** the lobby with teams, readiness, countdown, host privileges, BACK, late joiners and team errors.
- **What the original does:** N13; launch needs both teams (356); "GAME STARTS IN n SECONDS" (354-355); the host may
  "Launch all players, ready or not" (359); BACK confirms (362-363); late joiners: chat disabled (351), ghost or
  spectator (352-353); team error (367); team rule `FUN_002bc620` (web R91 §7).
- **Today:** *(2026-10-10, ONL-16, reading, reviewed 2026-10-10; research 266 §2)* the lobby's screen, readiness, the launch,
  the countdown and the host's role are ONL-16a's over SVC-07a, the voice ONL-16b's, the text chat ONL-23's keyboard and
  panel; the chat half's own rules run as the disc has them -- a late joiner's panel captioned #351 (`SetupLateJoiner`)
  and its R1 answered by #360 for 5 s with no keyboard (`do_chat`'s `late_joiner == 1` branch, the original's only gate:
  `SendChatText`'s path tests nothing), the lines kept across SWITCH TEAMS, the ARMORY and the launch (BCHATLISTVAR
  PERMANENT, D:L149534; emptied only by `ConnectToGameServer` and `HostLANGame`). Owner rulings that differ from the
  original, not reopened: a 10 s countdown from both sides seated (s5 `6b02410b`), a 3-5 min idle kick (`room.ts`
  W3.R13), a 16-player queue.
- **2026-10-10:** ONL-16, the chat half (web sprint 22, wave 2; `agent/online-onl16`): research 266 §2. The block's
  "chat disabled (351)" is #351 "Chat disabled for late joiners", the caption `SetupLateJoiner` writes over `ChatText`
  (`Enable_SM_Launch`'s late-joiner sequence, locs 350-353); the send's gate is #360 "Sorry, no chat for late joiners."
  in `do_chat` (`dlgGameLobby.rdr`, read through `tools/dump-online-dialogs.ts`). Both already ran as ONL-23 left the
  scripts; the three readings are pinned by `gameLobbyScreen.test.ts`. No code row changed; no name added. The block
  closes with its three halves done: ONL-16a over SVC-07a (the lobby to the launch, built), ONL-16b (the voice, sprint
  20) and this chat half; the proven level is ONL-32's.
- **Gap:** ~~the screen; readiness and launch rules in the room (SVC-07)~~ built (ONL-16a, SVC-07a; the chat half
  2026-10-10, above); left: the round's lines in the panel after a match (SVC-19's, research 266 §7) and the proven
  level (ONL-32).
- **Acceptance:** compared to `game_lobby.png`, `title_game_lobby.png`, `A_53`/`A_55`/`A_ready000..008`; the countdown
  label sequence "NOT READY 5, 4..." per frame; team-rule tests exist (`net/lobby.ts`).
- **Proven by:** ONL-32 (the two-instance ready-state capture).
- **Dependencies:** SVC-06, SVC-07, ONL-23, ONL-16a. **Size:** S. **Then:** ONL-17 (the ARMORY row). The voice half
  is ONL-16b's (sprint 20). *([2026-10-02, OT.R6] parked until the online path
  runs; ONL-16a, its path slice, is the lobby to the launch without chat and voice. Its L is kept (OT.R6) though
  only chat and voice are left in it: re-sized when the path has run.)* *([2026-10-10, PROMOTE-22] re-sized L -> S at
  sprint 22's adoption, W22.R5 of [sprint 22's plan](../plans/2026-10-10-web-sprint-22-the-results-and-the-lobbys-text.md)
  (the merge controller's word): the path has run -- readiness, the launch, the countdown and the host's role are
  SVC-07a's and ONL-16a's, built, the voice half ONL-16b's; what is left is the game lobby's text chat over ONL-23's
  keyboard and panel.)*
- **Unknowns:** the countdown's start condition (N14 contradicts web R91) -- a two-instance capture with ready states
  logged.
- **Owner calls:** **OC-5** -- do the existing rulings (10 s countdown, idle kick, 16-player queue) stand against the
  original's 30 s READY gate and host launch?
- *([2026-10-05, OT.R23] web research 170: its voice half is ONL-16b (proposed, below) -- the talk icon box, the
  `TalkerName` bar and CIRCLE held, over SVC-20b; ONL-16b was promoted into sprint 20 on 2026-10-07, so this block's
  voice dependency is now that slice and what is left here is the lobby's text chat.)*
- *([2026-10-10, sprint 22's adoption, W22.R5] the acceptance above is the chat half's only: the lobby's text chat on ONL-23's keyboard and panel and the late joiner's "chat disabled" (351); readiness, the launch, the countdown and the host's role are SVC-07a's and ONL-16a's, built, and the voice half is ONL-16b's (sprint 20) -- an implementer takes none of them on here.)*
- **Merged from:** online front end ONL-19.

### ONL-16a -- GAME LOBBY (`dlgGameLobby`) to the launch, without chat and voice
- **Slice of:** ONL-16 ([2026-10-02, OT.R6, OT.R7]; the online-path plan, `../plans/2026-10-02-online-path-target.md`):
  the lobby the path needs to start a match, without its text chat (the parked ONL-23; the panel drawn by ONL-23a) and
  without the voice floor (the parked SVC-20a). The path needs nothing of SVC-20a -- the talk icon is drawn idle by
  ONL-16's own Then line -- so the cut is this slice of ONL-16, not a slice of SVC-20a; and it stands on SVC-07a, the
  bridge up to the match's start, not on SVC-07's results.
- **Goal:** the lobby with teams, readiness, countdown, host privileges, BACK, late joiners and team errors, to the
  launch.
- **What the original does:** from ONL-16: N13, N14; launch needs both teams (356); "GAME STARTS IN n SECONDS"
  (354-355); the host may "Launch all players, ready or not" (359); BACK confirms (362-363); late joiners: chat
  disabled (351), ghost or spectator (352-353); team error (367); team rule `FUN_002bc620` (web R91 §7).
- **Today:** ONL-16's: no lobby screen; the s5 ARMORY opens on taking a seat (W5.R1); the owner's rulings that differ
  from the original (a 10 s countdown from both sides seated, a 3-5 min idle kick, a 16-player queue).
- **Gap:** the screen; readiness and launch over SVC-07a; the talk-icon box drawn idle and the CIRCLE VOICE CHAT ALL
  press answering nothing yet (owed to ONL-16, OT.R8).
- **Acceptance:** ONL-16's: compared to `game_lobby.png`, `title_game_lobby.png`, `A_53`/`A_55`/`A_ready000..008`;
  the countdown label sequence "NOT READY 5, 4..." per frame; team-rule tests exist (`net/lobby.ts`).
- **Proven by:** ONL-32 (the two-instance ready-state capture).
- **Dependencies:** SVC-06, SVC-07a, ONL-23a. **Size:** L. **Then:** ONL-17 (the ARMORY row); ONL-18; ONL-16 (chat);
  ONL-16b (voice).
- **Unknowns:** ONL-16's -- the countdown's start condition (N14 contradicts web R91) -- a two-instance capture with
  ready states logged.
- **Owner calls:** **OC-5** (ONL-16's) -- do the existing rulings stand against the original's 30 s READY gate and
  host launch?
- **Merged from:** sliced from ONL-16 by OT-0 (2026-10-02, OT.R6).
- *([2026-10-05, OT.R23] pointer: the lobby's voice -- the talk icon, the speaker's bar, CIRCLE held -- is ONL-16b
  (proposed, below; web research 170 §5.1); this slice is unchanged.)*
- **[2026-10-05, ONL-16a]** **The lobby is built to the launch** (merged at f6f23a8c, its follow-up at 78011261; web research 165): a listed game's
  CROSS runs `aux_join_game` -- the checks, the private game's keyboard, `JoinMPGame` (`FUN_002f83b0`: the settings into
  the valves, state 15), JoinGame over `/lobby/join-game` with the bearer and its three refusals (#441, "Password
  incorrect.", #443/#444), the game socket through `pinnedMatchSocket` (`ConnectToGameServer`, `CheckJoinMP`,
  `JoinGameServer`) -- into `dlgGameLobby.rdr`, whose valves are written from SVC-07a's `gameLobby`: the side lists,
  READY (`lobbyReady`, its 5 s; the server's 30 s gate, the host's alone since 732d4484: `READY_GATE_SEATS_READING`), SWITCH TEAMS (`switchTeams`), the countdown as `CountDown`
  draws it, the host's star and a host handed on, `ForceMPLaunch` (`launch`) on the dialog's MP_EIGHTY_READY, the late
  joiner (#352/#353). The bridge's closes: 4007 `dlgNetAbandoned.rdr` (#528), the others #365; BACK #362/#363 with
  `/lobby/leave-game`. The launch hands ONL-18 the open socket (`GAME_LOBBY_MATCH_START`). The entry is
  `GameLobbyCommands.enterGameLobby`; CREATE GAME's success enters through `created` (the creator hosts, its world
  report makes the room). Gated: the ARMORY (ONL-17), text chat (ONL-23). Not done: the captures (ONL-32); the layout
  has no control for the host's force launch (`HOST_LAUNCH_READING`).

### ONL-17 -- GAME LOBBY -> ARMORY -> lobby
- **Goal:** the ARMORY reached from the lobby row, returning to the lobby, pulled out by the launch countdown.
- **What the original does:** the ARMORY row (345, 357); `UiBackToLobby` popup 47, then 5 s (web R95.7);
  `IDFromBriefing` (web R91 §18.3).
- **Today:** the s5 ARMORY (`armory*.ts`) opens on a seat, not from a lobby.
- **Gap:** the transitions.
- **Acceptance:** the open and return transitions compared with the owner's `orig-armory-*.png` and recomp captures;
  the R95.7 pull-out tested.
- **Proven by:** ONL-32.
- **Dependencies:** ONL-16a, PLAT-34. **Size:** S. *([2026-10-02, OT.R6] it read "ONL-16": the row is the path's
  lobby, ONL-16a.)*
- **Unknowns:** none beyond web R95's ledger. **Owner calls:** none.
- *(2026-10-05, `agent/s17-armory`, merged at 23d2beb5; web research 167):* the lobby's ARMORY opens -- weaponselect's CROSS
  runs `goto_eq_mp_set_return_valve` whole (its gate retired), and READY forbids it as the original does (the script's
  FAIL, no un-ready); `returnto_lobby` / DONE / the pull-out (R95.7, over the existing `CheckForcedLaunch`) come back to
  the same seat and socket; `CharacterProfile`'s eight modes and `InitializeOnlineArmory` answer over SVC-24's records
  (`armoryProfileCommands.ts`; a 401 is `sessionLost`, a failed save shows nothing, `LOADOUT_SAVE_FAILURE_SILENT_READING`).
  Not done: PLAT-34's fold (the selection rows still the table's stand-ins), the captures (ONL-32).
- **Merged from:** online front end ONL-20.

### ONL-18 -- The loading screen (`dlgLoad`)
- **Goal:** the loading screen as the original draws it (picture, title, description, progress, spinning disc),
  including TRIANGLE back to the lobby.
- **What the original does:** N15.
- **Today:** the viewer's own loading UI (`loadMap.ts`), and over it INT-LOADING's interim: `dlgLoad.rdr` drawn from its
  records on a DOM canvas while a map loads, the disc turned by `SpinLoadingCD`'s keys, the fade in from black by
  `OnMenuStart`'s `MENUFADER` keys (`viewer/src/loadingPanel.ts`; web research 125 §5 lists what this task replaces).
  Since 2026-10-05 the interim screen holds through the join's readiness (PR #10, web research 125 §8), and
  `viewer/src/loadingJoin.ts`'s `LoadingJoin` is the completion source `dlgLoad`'s `ON_LOAD_COMPLETE` can use.
- **Gap:** the screen.
- **Acceptance:** frames compared to `A_ready009..020` and the recomp equivalent; duration measured; progress advances
  monotonically to ON_LOAD_COMPLETE; TRIANGLE behaviour matches.
- **Proven by:** ONL-32 (the recomp equivalent and a PCSX2 burst).
- **Dependencies:** PLAT-15, PLAT-10, the per-map ZDB readers (exist). **Size:** M.
- **Unknowns:** ~~whether `SpinLoadingCD`/`OnMenuStart`/`load_complete` exist anywhere~~ (answered: each map's
  `LDZANIM.ZAR`, web R125 §3; the spin is two linear 0.75 s scale motions, looped); where the progress value comes from
  (decomp; the bar's bitmaps are on no bank, R125.5); ~~what rank strings 2001-2005 show~~ (the offline game-complete
  ratings, `OnMenuStart`, R125 §3); how the load state's 0.5 s fader ramps and `OnMenuStart`'s 1.5 s MENUFADER fade
  compose (`LOADING_FADE_READING`, R125 §5: the 1.5 s fade in, no fade out -- a capture series of a load settles it).
- **Owner calls:** none.
- *([2026-10-06, OT.R25] **The owner widens this task**: one GENERIC loading screen for every map (each map's own
  `dlgLoad` from its `LDZANIM.ZAR`, the first release's three first), one module used by the test room and by the game
  lobby's launch (ONL-16a -> this screen -> the round); the loading time does real loading -- the map's archives,
  meshes, textures, sounds and round assets fetched and warmed while it shows, started from the lobby once the map is
  known; the original's countdowns built as the original's when matches are added: the lobby's 11 s launch countdown
  (SVC-07a's `gameLobby.ts`) and the round's "STARTING ROUND 1 OF 11" (A_ready021), a per-round start countdown to be
  read. Acceptance gains: every map of the play list loads through it in the lobby flow and in the test room, and the
  round starts with its assets warm. Not dispatched yet.)*
- **[2026-10-05, ONL-18]** **The hand-off is built** (merged at 2f33fc6e; web research 166): `GAME_LOBBY_MATCH_START` goes to
  the session's `LobbyMatch` (`viewer/src/lobbyMatch.ts`) -- PR #10's loading screen for the mission's map (one module,
  every map), the map's archive read while it shows, PR #10's hold and 0.5 s completion (`FUN_001f5e70`), then the match
  on the same client (`NetPage`'s `game.adopt`, `NetClient.rebind`: no second socket or ticket; `socketHolds` stays true
  from the lobby into the match; a drop of `NetPage`'s socket sends `holds(false)` and the next accepted welcome `true`). The countdown read: the lobby's `CountDown` is the only one; the round's clock is drawn from the room's
  round start (`FUN_002aa490`, `FUN_002a6ad0`). The way back (`dlgNetAbandoned.rdr` / `dlgNetError.rdr` as the load
  state writes them, the match's end into the same game's lobby with the client kept) builds its dialog on screen since sprint 17's close
  (d6bf6658: the menu state left and entered again, as the load state's exit; `GameLobbyCommands.matchReturned`; unit
  tests, no browser run of a match's end -- PF-26's screens still owe the call of `matchOver`). The slow
  loader: the original holds everyone at the host's barrier (`FUN_002c4020`); ours joined the running round
  (`SLOW_LOADER_PLACEHOLDER`) until ONL-18b's held round 1 (below). Not done: the match's world in
  the front end's page (then `LOBBY_MATCH_VIEWER_PLACEHOLDER`, since resolved by ONL-18c below), TRIANGLE, the captures
  (ONL-32).
- **[2026-10-05, ONL-18c]** **The match's world in the front end's page** (merged at 2c447c81; web research 166 §8):
  `viewer/src/matchMount.ts` `mountMatch` builds the match into an element it is given, reading none of `/testroom`'s
  markup -- the world decoded in the map viewer's worker while the loading screen shows (`matchLoader`), the walk on the
  pad, the own and the others' bodies, the HUD (the clock, the banners, the end screens, the scoreboard), and `NetPage`
  on the lobby's client (`game.adopt`; `NetPage.release` hands it back open at the match's end); the front end loads it
  with `import()` at the first match's load (OT.R12: its bundle carries neither it nor `main.ts`). Not done
  (`MATCH_MOUNT_PARTS_PLACEHOLDER`): the firearm, the throwables, WEAPON EXCHANGE, the ARMORY, the doors, the
  traversal, the effects and sound, the touch layer -- each still `main.ts`'s, owed by moving it into a part both pages
  mount (`main.ts` itself is unchanged). The two-page browser walk ran green (below; research 166 §8).
- **[2026-10-05, ONL-18d]** **The firearm in the front end's match** (merged at 7aba8bff; web research 166 §8):
  `viewer/src/matchFirearm.ts` copies `main.ts`'s gunplay piece by piece (the fire, the bloom, the view states, the kit
  and its swap, the fire modes and launcher-round slots, `spawnKit`, the R1 trigger and the zoom, fire-mode, reload,
  swap and inventory lanes, the reticle's pass, the effects, the died and round hooks); every round goes to the room only
  through `NetPage`. Not done: the throwables and launchers, the sound, WEAPON EXCHANGE, the ARMORY.
- **[2026-10-05, research 166 §8]** **The two-page walk runs green in a browser** (`e2e/twoPagesMatch.spec.ts`, web research
  166 §8): LOGIN to the briefing room on two pages by the original dialogs' own scripts, CREATE GAME on FROSTFIRE, the
  join, SWITCH TEAMS and READY, the launch, the loading screen and round 1 with each page seeing the other; A's rounds
  are taken by the room. A hit is not seen yet (no line of sight between the spawns); the joiner's READY comes up
  before the room's gate (the first press refused), recorded for ONL-16a / SVC-07a and since settled: the gate is the
  host's alone, a joiner's READY only its 5 s repeat (`READY_GATE_SEATS_READING`, 732d4484; research 165 §8).
- **[2026-10-06, ONL-18b]** **The load barrier** (`agent/s18-barrier`; web research 221): a launched game's round 1 is held
  until every seat seated at the launch has sent `loaded` -- the original's host barrier (`FUN_002c4020` D:L165416-165441,
  waited on in `FUN_001f5e70` D:L55693-55707; spectators not waited for) -- at most `LOAD_BARRIER_TIMEOUT_PLACEHOLDER`
  (90 s, a server adaptation: the original's load has no timer, research 179 §6.23); a leaver no longer counts, a side
  emptied abandons, a late `loaded` is ignored. The bridge marks the game launched from the hold, so the pages leave the
  lobby and load under it. The page sends `loaded` once a load, at the release (`LoadingJoin.begin`'s report: both
  `LobbyMatch` and `/testroom`; `NetClient.reportLoaded`, owed until the welcome). `SLOW_LOADER_PLACEHOLDER` retired;
  `ROUND_EPOCH_PLACEHOLDER` re-filed, still named. With it the additive `welcome.phase` (the room's state), which
  `bombPage.ts` reads: `JOIN_DECIDED_PHASE_READING` retired. Not done: the test room's countdown is not held, and the
  barrier would not keep a slow second seat's ARMORY there (research 221 §7: `grenadeSelfMp.spec`'s DONE stays conditional).
- **[2026-10-06, ONE-WIRE]** **The match on one wiring** (`agent/s18-onewire`; web research 222, 166 §8): the copies
  ONL-18c/d made of `main.ts`'s wiring are gone -- both pages mount the same parts: `viewer/src/matchCore.ts` (a
  capabilities switch, `/testroom` every part and the front end the firearm alone, pinned; the side, the kit on the
  map, the fog, the stand, the camera's lanes), `matchFirearm.ts` (the one firearm, `/testroom`'s equipment and sound
  plugged in), `matchNet.ts` (the `NetPage` deps; each part's own listed once and refused where its switch is off),
  `matchLanes.ts` (the pad's game lanes); sprint 27's action part is `matchActions.ts`, `/testroom`'s alone. `main.ts`
  3,005 lines to 2,398. Not done (`MATCH_MOUNT_PARTS_PLACEHOLDER`): the front end still mounts only the firearm of the
  switchable parts -- the throwables, launcher, world drops, R2 inventory, WEAPON EXCHANGE, ARMORY, doors, actions,
  traversal, sound, touch, tactical map and shadow are each its switch turned on and its part handed; no common frame
  runner (each page's frame calls the parts' steps in `main.ts`'s order).
- **Merged from:** online front end ONL-21; menus MENU-26.

### ONL-19 -- The in-round scoreboard's online fields
- **Goal:** the SELECT scoreboard with online game details, spectators and clan tags.
- **What the original does:** web R91 §11 and web research 87 §12; game details by type; up to 8 spectators; "[clan]
  name" rows (~~0x3e53b8/0x3e53c0, R91 §18.2.4~~ S:0x3e57a0 / S:0x3e57a8, `FUN_0022a290` D:L79042-79053 -- research 269
  §5.2, corrected 2026-10-13: 0x3e53b8 / 0x3e53c0 are the round-end screen's).
- **Today:** ~~`viewer/src/scoreboard.ts` fills "LAN game" and the game's name/type.~~ *[2026-10-13, merged at
  75c481390; research 269 §5]* `viewer/src/scoreboard.ts` branches on the `ComeFromLan` valve as `FUN_0022be20` does:
  online, its GAME DETAILS are the lobby's name (`MEDIUS_LOBBY_NAME`), `GAMENAMEVAR` and the type word, built once at
  the board's open; "LAN game" on a LAN only; up to 8 spectators; the "[clan]" strings drawn when a row carries a clan
  (~~none reaches the round yet -- the clans' half~~ *[2026-10-13, CLAN-TAG-ROUND, merged at 49ac1b28f; research 275]*
  each player's row carries his clan tag, read by the server at the seat from the account's clan); no rank, medal or
  rating; fed in both matches. Rendered by
  `e2e/menuScoreboard.spec.ts` (7882a9f73).
- **Gap:** ~~the online fields.~~ built (above); left: the proven level (ONL-32) ~~and the clan a row carries (the clans'
  half)~~ *[2026-10-13: carried by CLAN-TAG-ROUND, 49ac1b28f, research 275; a spectator's own tag and the spectator
  HUD's "[tag] name" left, research 275 §5]* *[2026-10-15, AD-13 (merged at 501869ea4; research 275 §5 item 5): a
  spectator's own tag told by the room's `seatClans` and drawn as "[tag] name" on the other spectators' speaker line
  (`FUN_00238ac0` D:L85680-85690; LATER 45 built); the spectator HUD's "[tag] name" for the followed player built by
  SPECTATOR-VIEW (126fed8b9, ONL-21's Today); left: his own info box (`SPECTATOR_OWN_INFO_PLACEHOLDER`, research 282
  §6); the scoreboard unchanged -- its SPECTATORS slots take the name alone (research 275 §5 item 2)]*.
- **Acceptance:** a recomp online round with SELECT held, compared (none exists: R91 §11).
- **Proven by:** ONL-32.
- **Dependencies:** SVC-06, SVC-08. **Size:** S.
- **Unknowns:** the online GAME DETAILS lines -- a capture.
- **Owner calls:** none.
- *([2026-10-04, OT.R18] web research 155 §3: the in-round scoreboard shows **no rank, medal or rating** -- it is
  drawn in code from name, score, kills and deaths (web research 87 §12, R91 §11), and the ELF names no medal
  texture for it; the medals are the lobby's (the game lobby's team lists, ONL-34, proposed below). Nothing of the
  ladder waits on this task and it waits on nothing of the ladder; its place in the plan is the last sprint, C.)*
- **Merged from:** online front end ONL-22.

### ONL-20 -- Round and final screens from the real layouts

- *(2026-10-04: moved to sprint 26 as PF-26, the sprint 26 controller's stream, by the owner's ruling in the main merge
  controller's seat; research 179 C1-D, V1 #8. Not this lane's.)*
- **Goal:** replace `roundScreens.ts`'s placeholders with the `READERX.ZAR` layouts and `SPLA_TXR` bitmaps, and return
  to the game lobby.
- **What the original does:** N1, N16. The placeholders `ROUND_SCREEN_LAYOUT_PLACEHOLDER`, `TITLE_`, `PANEL_`,
  `TEAM_BAR_`, `STRIPE_`, `YOUR_STATS_`, `BOTTOM_CAPTION_PLACEHOLDER` (web R91 §18) are resolvable from the full disc.
- **Today:** `viewer/src/roundScreens.ts` with SOCOM 1 stand-ins.
- **Gap:** the layouts through PLAT-05, every placeholder replaced by a cited value.
- **Acceptance:** the layouts parsed; a recomp capture of a round end and a match end compared (none exists: R91 §18.4).
- **Proven by:** ONL-32.
- **Dependencies:** PLAT-05, PLAT-07, ONL-16a. **Size:** M. *([2026-10-02, OT.R6] it read "ONL-16": the screens
  return to the lobby ONL-16a builds.)*
- **Unknowns:** `ROUND_LIST_COLUMNS_PLACEHOLDER` -- read `.data` 0x3dc7f0..; `CLIENT_FINAL_EXIT_PLACEHOLDER` -- a
  two-client capture.
- **Owner calls:** none.
- *([2026-10-04, OT.R18] web research 155 §1.2, §3: these screens show the round's and the match's own numbers and
  **no rank, medal or rating**. YOUR STATS (`PlayerLbContents`, `FUN_00225a00` D:L76886-76930) is nine numbers of
  the local player's match block, in order: score, kills, deaths, hit ratio x 100, head shots, primary objectives,
  bonus objectives, friendly kills, suicides -- under UIMPXLOC 2106-2108 SCORE / KILLS / DEATHS and 2116-2121 HIT % /
  HEAD SHOTS / PRIMARY OBJECTIVES / BONUS OBJECTIVES / FRIENDLY KILLS / SUICIDES. Two frames exist after all: the
  round's end on PCSX2, `s4_pcsx2/A_rend049`-`052` (ROUND COMPLETE, a draw), and the match's end on the recomp,
  `s13_v7_paused_peer_20260925_193109/A_hold32.png` (GAME COMPLETE: the totals, MVP, YOUR STATS, the rounds, TIME
  PLAYED). What the ladder takes from the match's end is not this screen's: the room hands the same counters to the
  services (SVC-12d, proposed in segment 06). The task stands as written.)*
- **Merged from:** online front end ONL-23.

### ONL-21 -- Spectating (WATCH GAME)
- **Goal:** join as a spectator from the list, with the spectator camera and help lines.
- **What the original does:** WATCH GAME (406, 413, 416-417, 419); SPEC/MAX; the spectator password; camera modes
  follow/free/scenic (`FUN_00295260`); help lines (web R91 §12). *[2026-10-14, research 314 §2.1, §3: the captions'
  words, the cross marked "X" -- #402 "SPEC/MAX", #406 "WATCH GAME", #413 "X Choose game to watch.", #416 "X Activate
  the games list and choose a game to watch.", #418 "There are no games to join." (either button on an empty list);
  #417 "There are no games to watch." and #419 "X  Join game as a spectator." are used by no online script; the watch's
  password keyboard is titled #423 "Enter a Password to Connect." (WATCH-JOIN's correction: not #252 "Enter Spectator
  Password"); #424 "You cannot be a spectator in that game. Please try a different game."; #440 "Timeout Failure";
  #352 "This game has already started. Would you like to spectate the game in progress?"; #527 on JoiningAnim (its
  string shared, "PLAYER REJECTED") under the host's "Too many spectators" (S:0x3f24b0, reason 2).]*
- **Today:** ~~the map viewer's `watch` hello (`online.ts`, `net/lobby.ts` watchers); no join from a list, no camera
  modes.~~ *[2026-10-14, sprint 19's second half; research 314]* WATCH GAME from the BRIEFING ROOM's list runs from
  the disc's scripts (`aux_join_game`: #524's clan test, no rank test for a watch, `GameHasSpectatorPassword`,
  `JoinMPGame`, JoinGame with join type 1 and the spectator password); the watcher's seat is the GAME LOBBY's SPECTATORS
  column (`player_team` 16: the ARMORY off, SWITCH TEAMS lit by the script, READY refused by the room); in the match the
  spectator camera, its pad, HUD and help lines since PF-31, PT-19b and PAR-48 (research 248, 232 §5, 282), the START
  menu's spectator rows and ABORT (MATCH-02), voice on channel 10, the scoreboard's spectators, VOTE ALL. Built on that
  by sprint 19's second half: **WATCH-JOIN** (merged at 4b1513323) -- a game with a spectator password lists security
  level 4 beside 1 and WATCH GAME asks it on the #423 keyboard (`SPECTATOR_PASSWORD_SECURITY_BIT_READING`); the
  services bound a watcher by the MaxPlayers sum only and the room refuses one past `maxSpectators` "Too many
  spectators" (`WATCH_SLOTS_HOST_REFUSAL_READING`; research 154 §6's departure retired); the rank refusal a player's
  only (P:L4571; `RANK_GATE_ON_SERVER_ADAPTATION`'s scope). **LATE-WATCH** (merged at 2ddd802f1; W19.R12) -- a watch of
  a launched game shows #352, YES only waits and READY loads every late seat into the round in progress: the watcher
  spectates it, the late player loads as the ghost, seated from the next round (`READY_LOADS_LATE_JOINER_READING`; a
  seat that never presses READY is `LATE_SEAT_NEVER_READY_PLACEHOLDER`). **SPECTATOR-VIEW** (merged at 126fed8b9) --
  "[tag] name" in the info box (`FUN_00238500`), the jump with no alive filter (research 248 F3), the scenic view's live
  look and zoom, reset at its ends (248 F5; `SCENIC_LOOK_AXES_READING`, `FOLLOW_OFF_DEAD_READING`). **WATCH-DOCS** -- a
  test pins `WATCH_NO_SLOT_STALE_VALVE_READING` (`watchNoSlotValve.test.ts`: #424 with `MaxSpectatorsValve` 0; with it
  8 from an earlier join or from CREATE GAME opened and left, no request and #440 at 30 s; reading, pending review).
  The three merged tasks are reading, reviewed; the map viewer's `watch` hello stays a browser instrument.
- **Gap:** ~~the join and the camera.~~ *[2026-10-14]* built (Today, above); left: ~~the spectator's own clan tag
  (`CLAN_TAG_AT_SEAT_READING`, research 275 §5)~~ *[2026-10-15, AD-13 (merged at 501869ea4): told by the room's
  `seatClans` and drawn on the other spectators' speaker line; `CLAN_TAG_AT_SEAT_READING` narrowed, research 275 §3, §5
  item 5; his own info box's tag rides `SPECTATOR_OWN_INFO_PLACEHOLDER`, research 282 §6]*, what a watcher's READY
  press shows (`WATCHER_READY_PRESS_READING`), the
  late seat that never presses READY, 314 §4.2's residuals (a late seat's banner and intro for a round it heard start
  in the lobby; the drawn result panel from the welcome), and the proven level (ONL-32). Research 248's F2, F4 and F6
  are not ONL-21's.
- **Acceptance:** a recomp spectator capture compared; camera-mode tests cite R91 §12.
- **Proven by:** ONL-32.
- **Dependencies:** ONL-12, SVC-06. **Size:** M.
- **Unknowns:** ~~`SPECTATOR_PAD_PLACEHOLDER` (which buttons are bytes +5/+6/+7/+10) -- a pad trace in a recomp spectator
  run.~~ *[2026-10-14: retired 2026-10-06 (PF-31, research 101 §5; research 314 R314.8) -- +5 Up, +6 Down, +7 Triangle,
  +10 X, the cycle's +3 Right / +4 Left, each tested `== 3`]* the open ones are research 314 §8's --
  `SPECTATOR_PASSWORD_SECURITY_BIT_READING`, `WATCH_SLOTS_HOST_REFUSAL_READING`, `READY_LOADS_LATE_JOINER_READING`,
  `LATE_SEAT_NEVER_READY_PLACEHOLDER`, `WATCH_NO_SLOT_STALE_VALVE_READING` (pinned, not measured),
  `WATCHER_READY_PRESS_READING`, `SCENIC_LOOK_AXES_READING`, `FOLLOW_RETIRED_BODY_PLACEHOLDER`,
  `FOLLOW_DELETE_QUEUE_PLACEHOLDER`, `FOLLOW_AFTER_DELETE_PLACEHOLDER` (AD-8, 2026-10-16; `FOLLOW_OFF_DEAD_READING`
  retired, research 314 §5.4) -- each ONL-32's spectator capture.
- **Owner calls:** none.
- **Merged from:** online front end ONL-24.

### ONL-22 -- Leaving and network errors
- **Goal:** the abort, kick, abandon, disconnect and timeout dialogs, and where each returns to.
- **What the original does:** `dlgNetAbort` (529-531), `dlgNetBanned` (539-541, the vote kick), `dlgNetAbandoned` (528),
  `dlgNetError` (90 s timeouts, web R91 §18.2.4), 365, 548. *[2026-10-14, research 315 §1-§2: where each lands --
  ABORT -> `dlgNetAbort` (#529, #531), 3 s, SOCOM II ONLINE; the vote kick and VOTE ALL's eject -> `dlgNetBanned`
  (#541, #539, #540), 4 s, SOCOM II ONLINE; the abandon -> `dlgNetAbandoned` (#528), SOCOM II ONLINE at once; a network
  failure in the load, the match or a round screen -> `dlgNetError`: with `mp_net_errno` 32 a popup with MAIN MENU,
  then REBOOT, else SOCOM II ONLINE at once; in the GAME LOBBY `OnNetError` (errno 32 #365 "You have been disconnected
  from SOCOM Online." -> REBOOT, else the event's text -> the BRIEFING ROOM), #367 "Team Assignment Error.", a version
  mismatch -> `dlgNetAbort`; the lobby connection lost elsewhere -> `OnMultiplayerDisconnect` (`LobbyBailout`, REBOOT);
  the host's leave -> no screen (the role migrates). #548 is used by no online script (research 157 R157.6).]*
- **Today:** ~~a `kicked`/`abandoned` protocol (`net/protocol.ts:495, 511`); no dialogs.~~ *[2026-10-14, sprint 19's
  second half; research 315]* the `kicked` / `abandoned` protocol (`net/protocol.ts:1196, 1214`) and the routes to the
  four dialogs (ONL-18's `returnDialog`, MATCH-02's ABORT, PF-27's abandon), each dialog run by the menu state from the
  disc's set. Built on them: **NET-ERRNO** (merged at 25dabe0ae; W19.R9) -- a load or match ended on a close the page
  names #365 writes `mp_net_errno` 32 first (`NET_ERRNO_BY_CLOSE_READING`), so that close REBOOTs after MAIN MENU from
  the match as from the lobby (the idle kick with it, H222); the landings of `dlgNetBanned`, `dlgNetAbandoned` and
  `dlgNetError` (errno 0 and 32) pinned on the disc, and MP_MEDIUS_ERROR on `dlgNetError`'s popup through
  `OnMultiplayerDisconnect` to REBOOT (on `dlgNetBanned`'s 4 s only if CROSS comes within the wait, 315 §9).
  **BAILOUT** (merged at caf35b5ee) -- `LobbyBailout` (`FUN_0027dc90` ->
  `FUN_002f4240(0x44f370)`) as the page's one lobby teardown, answering 1, the lobby left once beside `UnInitNetwork`.
  **ROUND-90** (merged at d96ffb219) -- a round screen held 90 s from its own open ends the match on `dlgNetError.rdr`
  through its own return, writing no errno (`ROUND_SCREEN_TIMEOUT_RETURN_READING`); H105 closes at its landing on
  `main` (W19.R11). **VERSION-ABORT** (merged at fc6fe2481) -- a game hello refused for its protocol version posts
  MP_VERSION_NUMBER_ERROR (`VERSION_REFUSAL_ABORT_READING`, `FUN_002c0850` D:L163320-163326): `dlgNetAbort.rdr`, 3 s,
  SOCOM II ONLINE, no errno written -- from the GAME LOBBY (`version_failure_2`) and the BRIEFING ROOM's join
  (`version_failure_1`); the refusal's text one spelling the room and the page share (`versionRefusalText`). All four
  reading, reviewed.
- **Gap:** ~~the dialogs.~~ *[2026-10-14]* built (Today, above); left: ~~the version refusal's abort to `dlgNetAbort`
  (VERSION-ABORT, sprint 19's second half, in flight)~~ (merged, Today), the load's own version binding
  (`dlgLoad.rdr`'s `exit_load_screen`, P:L8223, `LobbyMatch`'s; research 315 §11), the abandon's scope (`ABANDON_LATE_JOINER_READING`, 315 §3.3:
  the below-three #528 a late joiner's; W19.R10, flagged), the GAME LOBBY's not-32 branch (reachable once the errno's
  codes are read), the page's own drawing of a held last round screen (LATER 52), and the proven level (ONL-32).
- **Acceptance:** each forced on the local stack, compared with the recomp capture.
- **Proven by:** ONL-32.
- **Dependencies:** PLAT-10, ONL-12, ONL-16, SVC-23, ONL-22a. **Size:** M. *([2026-10-02, OT.R6] parked until the
  online path runs; ONL-22a, its slice, is leaving and returning.)*
- **Unknowns:** ~~the disconnect timeouts other than 90 s -- the scripts.~~ *[2026-10-14, research 315 §4, §3.5]* read:
  the scripts set no other in-game timeout -- each round screen's 90 s is the only one that leads to `dlgNetError`, the
  30 s waits end a join, not a game (the BRIEFING ROOM's with #440, WORLD OF SOCOM's with no text, R315.9), and the
  GAME LOBBY and the load have none; the network library's own (the
  DME's) is not read. Open: which network failure writes `mp_net_errno` 32 -- its one writer `FUN_002f4090`
  (D:L194249-194306) is read, the library's codes behind it are not (`NET_ERRNO_DISCONNECTED_READING`,
  `NET_ERRNO_BY_CLOSE_READING`); the abandon's scope (`ABANDON_LATE_JOINER_READING`); how long a buttonless popup shows
  before its switch (`NET_POPUP_BEFORE_SWITCH_READING`) -- ONL-32's captures.
- **Owner calls:** none.
- **Merged from:** online front end ONL-25.

### ONL-22a -- Leaving a game and coming back (`dlgNetAbort`, `dlgNetAbandoned`)
- **Slice of:** ONL-22 ([2026-10-02, OT.R6]; the online-path plan, `../plans/2026-10-02-online-path-target.md`): the
  two ways two players leave a game -- one aborts, or the host abandons it -- and where each returns, without the vote
  kick's dialog (`dlgNetBanned`, SVC-23's moderation, parked) and the timeouts (`dlgNetError`). It follows the match's
  start, so it is not in "all of the online work up to match start" (OT.R7); the plan keeps it beside ONL-20.
- **Goal:** the abort and abandon dialogs shown, and each returning where the original returns.
- **What the original does:** from ONL-22: `dlgNetAbort` (529-531), `dlgNetAbandoned` (528).
- **Today:** ~~a `kicked`/`abandoned` protocol (`net/protocol.ts:495, 511`); no dialogs.~~ *[2026-10-14; research 315
  §5, R315.10]* both dialogs shown and returning where the original returns: ABORT -> `dlgNetAbort.rdr` (#529, #531),
  3 s, SOCOM II ONLINE (MATCH-02, merged at 77c4c2c88; `matchAbort.test.ts`); the abandon -> `dlgNetAbandoned.rdr`
  (#528), SOCOM II ONLINE at once (ONL-18's `returnDialog`, PF-27's triggers; the lobby side held by
  `gameLobbyScreen.test.ts`, the match side pinned on the disc by NET-ERRNO, merged at 25dabe0ae, `matchAbort.test.ts`);
  the protocol's events at `net/protocol.ts:1196, 1214`. The port's abandon triggers depart from the original as read
  (`ABANDON_LATE_JOINER_READING`, 315 §3.3; W19.R10, flagged). Each dialog is held at the reading level by its set's
  test; the recomp capture is owed (ONL-32).
- **Gap:** ~~the two dialogs and their returns.~~ *[2026-10-14]* built (Today, above); left: the abandon's scope and
  the proven level.
- **Acceptance:** each forced on the local stack and compared with the recomp capture of the same dialog; where none
  exists the score is owed to its manifest row (W9.R8) and the dialog is held at the reading level by its set's test.
- **Proven by:** ONL-32.
- **Dependencies:** PLAT-10, ONL-12, ONL-16a. **Size:** S. **Then:** ONL-22 (the ban, the error and the timeouts).
- **Unknowns:** ~~where each dialog returns -- the two sets' reads.~~ *[2026-10-14, research 315 R315.2, R315.4]* read:
  both return to SOCOM II ONLINE (on a LAN the LAN BRIEFING ROOM), ABORT after 3 s, the abandon at once; open: the
  abandon's triggers (`ABANDON_LATE_JOINER_READING`) -- ONL-32's capture B.
- **Owner calls:** none.
- **Merged from:** sliced from ONL-22 by OT-0 (2026-10-02, OT.R6).

### ONL-23 -- Text chat panels (briefing room, game lobby)
- **Goal:** R1 -> chat keyboard -> the line shown on the panel as "name (All): text", L1/L2 scroll, the ignore filter
  applied.
- **What the original does:** N19; `ChatSkb`/`PlayerChatSkb` (PLAT-17); `SendMediusChat`/`SendChatText`.
- **Today:** *(2026-10-10, ONL-23, reading, reviewed 2026-10-10; research 266 §1)* both panels run text chat: R1 and a USB
  keyboard's ENTER open the chat keyboard (`ChatSkb`: CHATMESSAGE 100 / 99, CHATTEXT 63 / 63); the briefing room's line
  and every whisper go over SVC-18's paths (`SendMediusChat`, `/w name text`, FindPlayer then type 1), the game lobby's
  on the game socket (`SendChatText`, the seat's own line at once); the briefing room's received lines polled
  (`CHAT_POLL_MS_ADAPTATION`) and drawn as the console draws them -- `"#C\x80\x80\x80name: text"` received,
  `"#C\x80\x80\x80 name: text"` its own -- its 11 per room; the game lobby's `"name (All): text"`, its 21; L1 / L2 scroll
  both; the ignore filter's effect is the server's (SVC-17), the page drawing what it is sent.
  `TEXT_CHAT_GATE_READING` and `LOBBY_TEXT_CHAT_GATE_READING` retired.
- **Gap:** the two-client exchange against the three captures (a browser window, the controller's word); the
  player info's whisper (`playerinfo_send_message`) is reached only once PLAYER LIST has rows
  (`ROOM_PLAYER_LIST_PARKED_READING`); the ignore by name from the keyboard's Action2 (`AddToIgnore`, ONL-25); the
  late joiner's popup (ONL-16).
- **Acceptance:** the two-client exchange compared with `A_chat_02_entered.png`, `B_chat_A_to_B.png`,
  `A_chat_B_to_A.png` (PC research 66 rounds 2-3, wt-s13-o2).
- **Proven by:** ONL-32.
- **Dependencies:** PLAT-17, SVC-18, SVC-17, ONL-23a. **Size:** M. *([2026-10-02, OT.R6] parked until the online
  path runs; ONL-23a, its path slice, draws the panels.)*
- **Unknowns:** panel history length; briefing-room chat untested on the console.
- **Owner calls:** none.
- **Merged from:** online front end ONL-26 (screens).

### ONL-23a -- The chat panels drawn, before text chat
- **Slice of:** ONL-23 ([2026-10-02, OT.R6, OT.R8]; the online-path plan, `../plans/2026-10-02-online-path-target.md`):
  the panels as the briefing room and the game lobby draw them before any line has arrived, without the chat keyboard,
  the routing (SVC-18) and the ignore filter (SVC-17) -- text chat is owed along the path, not blocking (OT.R8).
- **Goal:** the briefing room's and the game lobby's chat panels drawn as the original draws them, R1 answering
  nothing yet.
- **What the original does:** N9 (the chat panel, "L1 and L2 to scroll chat", "R1 TEXT CHAT"); N13; N19 (R1 opens text
  chat in the briefing room and the game lobby); `A_48`, `A_53`.
- **Today:** *(2026-10-10)* both panels drawn from the disc's layout and fed by ONL-23's text chat (its Today; research
  266 §1); R1 opens the chat keyboard -- the slice's "R1 answering nothing yet" ended with ONL-23.
- **Gap:** the panel elements of `dlgMPBriefingRoom` and `dlgGameLobby` drawn empty; R1's text-chat entry owed to
  ONL-23 (OT.R8), never replaced by another page. *([2026-10-10, ONL-23] closed: the panels carry the text chat -- R1's keyboard, the lines drawn as the console draws them, L1 / L2 scrolling; research 266 §1.)*
- **Acceptance:** the panel region of `A_48` and `A_53` compared with redotcom's empty panel where those frames show it
  empty (or a recomp frame before any line); a unit test that R1 opens nothing while ONL-23 is owed.
- **Dependencies:** PLAT-15, ONL-33. **Size:** S. **Then:** ONL-23 (the keyboard hook, the lines, L1/L2).
- **Unknowns:** whether an archived frame shows either panel empty -- the frames read, else a recomp capture (ONL-32).
- **Owner calls:** none.
- **[2026-10-05, ONL-12]** **The briefing room's panel is drawn** (pending review; web research 162 §4): `ChatWindowTxt`
  (#519) over `CHATLIST` on MEDIUS_CHAT_RECV_VAR, empty from the lobby session's start, and the help bar's TEXT CHAT, as
  the disc lays them out; L1 / L2 scroll the empty panel; R1 and a USB keyboard's ENTER (`do_chat`) open nothing
  (`TEXT_CHAT_GATE_READING`; live chat is the parked ONL-23). Not done: the game lobby's panel (`dlgGameLobby`,
  ONL-16a's screen) and the comparison with `A_48` / `A_53`.
- **[2026-10-10, ONL-23]** Both panels are drawn and fed (research 266 §1): the game lobby's `ChatText` (#343) over
  `B_CHATLIST` on BCHATLISTVAR, emptied at `ConnectToGameServer`; R1 opens the chat keyboard (the gate retired, see
  ONL-23's Today). Not done: the comparison with `A_48` / `A_53`.
- **Merged from:** sliced from ONL-23 by OT-0 (2026-10-02, OT.R6).

### ONL-24 -- FRIENDS (`dlgFriendList`)
- **Goal:** the friends list, add/confirm/reject, message, view info, invite to game and remove.
- **What the original does:** captions 308-337 (an authorization flow: 327-328, 337).
- **Today:** ~~none.~~ *[2026-10-12, merged at a6ae27b6f; research 269 §3]* the FRIENDS page from `dlgFriendList`'s
  record over SVC-16: the list's five cells per row (`FUN_00301a70`), VIEW INFO, CROSS to PLAYER INFO with the FRIEND
  origin, ADD NEW FRIEND's checks and request, CONFIRM / REJECT, REMOVE with #329; MESSAGE is the existing whisper.
  INVITE TO GAME is not on the original's page (seven buttons, none an invite).
- **Gap:** ~~the pages; the operations are SVC-16.~~ built (above); left: the proven level (ONL-32).
- **Acceptance:** a two-persona recomp run on the local stack (PC research 80-online-menus "Friends list" row), compared
  screen by screen.
- **Proven by:** ONL-32.
- **Dependencies:** SVC-16, PLAT-17. **Size:** M.
- **Unknowns:** every frame (no capture exists).
- **Owner calls:** none.
- **Merged from:** online front end ONL-28.

### ONL-25 -- IGNORE (`dlgIgnoreList`)
- **Goal:** add and remove ignored players.
- **What the original does:** captions 368-376; the chat keyboard's IGNORE key.
- **Today:** ~~none.~~ *[2026-10-11, merged at 65cd082e1; research 269 §1]* the IGNORE page from `dlgIgnoreList.rdr`
  through the dialog runtime (IGNORE, REMOVE IGNORE, the list's three columns, #374's confirmation, #376's not-found)
  over SVC-17's routes; the SOCOM II ONLINE menu's Ignore row; the chat keyboard's IGNORE key (the typed name ignored).
- **Gap:** ~~the page; the list and its effect are SVC-17.~~ built (above); left: the proven level (ONL-32).
- **Acceptance:** recomp capture comparison.
- **Proven by:** ONL-32.
- **Dependencies:** SVC-17. **Size:** S.
- **Unknowns:** every frame. **Owner calls:** none.
- **Merged from:** online front end ONL-29.

### ONL-26 -- Clan: create (`dlgCreateClan`)
- **Goal:** the create-clan page.
- **What the original does:** captions 217-226 (questionable content 225; failure 223).
- **Today:** ~~none.~~ *[2026-10-13, merged at c16867679; research 271]* `dlgCreateClan` from the disc: captions
  217-222, SET CLAN NAME on the `MPPLAYERNAME` keyboard (#224, 13 characters / 31 bytes), CREATE over SVC-08's
  `CreateClan` and its stats post, #223 for any refused create, #225 with #226 for a filter refusal, the success to the
  leader's roster; SOCOM II ONLINE's CLAN row is the original's `create_modify_clan` (the leader's roster, the member's,
  else CREATE CLAN), the client's clan from ONL-27's GetMyClans. The text filter not asked
  (`CLAN_NAME_FILTER_PLACEHOLDER`), the clan ladder post not sent (`CLAN_LADDER_POST_PLACEHOLDER`, SVC-11's).
- **Gap:** ~~the page; the operation is SVC-08.~~ built (above); left: the proven level (ONL-32), the text filter (H85 /
  SVC-23) and the clan ladder post (SVC-11).
- **Acceptance:** PC research 80-online-menus H1 "Clan: create" (title crop) compared on SOCOM Legacy, with the server
  record checked through SVC-08.
- **Proven by:** ONL-32.
- **Dependencies:** SVC-08, PLAT-17. **Size:** M.
- **Unknowns:** ~~the clan-name keyboard and cap -- a capture and a script read (ONL-33).~~ *[2026-10-13, research 271
  §2.1]* the keyboard and its cap read off the disc: `MPPLAYERNAME`, 13 characters / 31 bytes;
  `CLAN_NAME_CHARS_PLACEHOLDER` kept (the original server's rule for a name, which no console can show: H85, ONL-33);
  the frames -- a capture.
- **Owner calls:** none.
- **Merged from:** online front end ONL-30.

### ONL-27 -- Clan: roster, member and leader pages
- **Goal:** the roster pages for members and for the leader.
- **What the original does:** `dlgManageRoster` (459-474), `dlgManageRosterLeader` (475-506: edit news, invitations,
  remove, appoint leader, disband, clan tag); columns RANK/MEDAL/MEMBER/POSITION; clan rating (462).
- **Today:** ~~none.~~ *[2026-10-13, merged at 4aefd9f5c; research 272]* GetMyClans in place of GetClan's stub
  (`FUN_002e8a90` / `FUN_002e8bd0`; `GET_CLAN_STUB_READING` retired), so the CLAN row reaches a member's or the leader's
  roster for a clan made in any session; both rosters -- `dlgManageRoster` (RANK / MEDAL / MEMBER / POSITION, LEAVE
  CLAN) and `dlgManageRosterLeader` (remove, appoint leader, disband, the clan tag on `MPPLAYERNAME` 3 / 15; its
  invitations ONL-28's page, its edit news ONL-29's) -- over SVC-08 / SVC-09 / SVC-13; the clan rating shows 0, the
  roster builder's integer (`FUN_002e6af0` D:L186623; W18.R13 as read). ~~PLAYER INFO's CLAN origin from the roster not
  read (`PLAYER_INFO_ORIGIN_LISTS_PLACEHOLDER` kept, research 272 §11).~~ *[2026-10-15, PLAYER-INFO-CLAN (merged at
  36b8c5bd4; research 272 §5): built -- a `clanState(name)` hook over `LobbyClan.find`, mounted in `ladderLobbyHost.ts`,
  so the roster's VIEW INFO gives a member's online state and roster position; `PLAYER_INFO_ORIGIN_LISTS_PLACEHOLDER`
  retired, LATER 42 struck.]* *[2026-10-15, CLAN-ROSTER-LADDER (merged at 590c109bd, 2026-10-14; research 310 §6.1): the
  clan rating is the roster's eight-best mean, 0 under eight members.]*
- **Gap:** ~~the pages over SVC-08/SVC-09/SVC-13.~~ built (above); left: ~~PLAYER INFO's CLAN origin (272 §11)~~
  *[2026-10-15: built by PLAYER-INFO-CLAN, 36b8c5bd4]*, ~~the clans' ladder and the roster rows' ladder fields (SVC-11 /
  SVC-13)~~ *[2026-10-15: built by CLAN-ROSTER-LADDER (590c109bd) and CLAN-BOARD-SERVER (053e82417), research 310 §6;
  CLAN RANKING by ONL-30 (406e46fd9)]*, ~~the own record's clan fields (`CLAN_RECORD_POST_PLACEHOLDER`)~~
  *[2026-10-15, CLAN-RECORD-POST (merged at 5b1dad159): the services write the record's clan name, tag and leader bit at
  the account's own GetMyClans reply and quit; `CLAN_RECORD_POST_PLACEHOLDER` retired, `RECORD_CLAN_FIELDS_READING` in
  its place (research 272 §8 item 4); its difference (e) -- the create, a leader's own disband and own tag reach the
  record at the next GetMyClans -- LATER 55]*, ~~a member's clan id to CREATE GAME, AUTOPLAY and the game lobby
  (CLAN-ID-WIRE, the clans' plan)~~ *[2026-10-13: built -- CLAN-ID-WIRE merged 32a8b70be, research 272 §3]*, the proven
  level (ONL-32).
- **Acceptance:** recomp captures per page, plus the server state.
- **Proven by:** ONL-32.
- **Dependencies:** ONL-26, SVC-09, SVC-13. **Size:** L.
- **Unknowns:** every frame. **Owner calls:** none.
- **Merged from:** online front end ONL-31.

### ONL-28 -- Clan: invitations pages
- **Goal:** invite, revoke and respond to clan invitations.
- **What the original does:** `dlgInvitedPlayers` (377-394; at most 16 members plus invitees, 384);
  `dlgRespondToInvites` (724-736, "must leave before joining"); the INVITATIONS row (N6).
- **Today:** ~~none.~~ *[2026-10-13, merged at 4cd320410; research 273]* INVITE PLAYERS (`dlgInvitedPlayers`: the
  sent list, the invite on the game's keyboard 14 / 31 with the refusals #390-#393 in the original's order, clan full
  #384 at 16 members and invitees, the revoke #388 / #389) and RESPOND TO INVITES (`dlgRespondToInvites`: accept and
  decline, the leader's and the member's branches since ONL-27) over SVC-09; the INVITATIONS row of SOCOM II ONLINE
  live (N6). ~~The name's lookup named (`INVITE_NAME_LOOKUP_PLACEHOLDER`).~~ *[2026-10-15, NU-14 (merged at
  67e2761af): the invite asks the services' own AccountGetID at `/lobby/account-id`, a logged-in account of the name
  (`ACCOUNT_GET_ID_PRESENCE_READING`); `INVITE_NAME_LOOKUP_PLACEHOLDER` retired, research 273 §7, §9.]*
- **Gap:** ~~the pages over SVC-09.~~ built (above); left: ~~an AccountGetID on the services
  (`INVITE_NAME_LOOKUP_PLACEHOLDER`)~~ *[2026-10-15: built by NU-14, 67e2761af -- research 273 §9]*, ~~the server's
  ticketless branch (research 273 §9)~~ *[2026-10-15, INVITE-TICKETLESS (merged at 095adf3cd): a ticketless request
  answered 401, `CLAN_INVITATIONS_TICKETLESS_ADAPTATION` removed -- research 273 §9]*, the proven level (ONL-32).
- **Acceptance:** two personas, A invites and B accepts, compared (PC research 80-online-menus H1 "Clan: invite").
- **Proven by:** ONL-32.
- **Dependencies:** ONL-26, SVC-09. **Size:** M.
- **Unknowns:** every frame. **Owner calls:** none.
- **Merged from:** online front end ONL-32.

### ONL-29 -- Clan messages pages
- **Goal:** clan messages, posted by the leader and shown under MESSAGES.
- **What the original does:** the MESSAGES "Clan messages" band (775); 485/497/503-504; "No clan messages.".
- **Today:** ~~none.~~ *[2026-10-13, merged at a41ce242c; research 274]* the MESSAGES "Clan messages" band (775:
  "Retrieving messages from server...", the texts oldest first, or "No clan messages."), asked from GetMyClans' success
  since ONL-27; the leader's EDIT NEWS (#475 / #485 / #498: the kept list, post and edit one row, #503 / #504, delete) on
  `ChatSkb` (#497) over SVC-10.
- **Gap:** ~~the pages over SVC-10.~~ built (above); left: the proven level (ONL-32).
- **Acceptance:** PC research 80-online-menus H1 "Clan: messages".
- **Proven by:** ONL-32.
- **Dependencies:** SVC-10, ONL-09. **Size:** S.
- **Unknowns:** ~~the message length cap (200 bytes in the record, SVC-10; the keyboard cap unknown).~~ *[2026-10-13,
  research 274 §3]* the keyboard's cap read: `ChatSkb`, 199 characters / 199 bytes -- fits the record's 200-byte field
  (SVC-10); the frames -- a capture. **Owner calls:** none.
- **Merged from:** online front end ONL-33.

### ONL-30 -- PLAYER RANKING and CLAN RANKING pages, player info
- **Goal:** the ladder pages ("THE PODIUM", the top ten), and the PLAYER INFO page reached from them.
- **What the original does:** `dlgLadderLobby` (395-398, 151), `dlgClanLadderLobby` (148, 151); 765-766; LadderUp/Down,
  LadderPressUp/Down, ON_LADDER_REFRESH; PLAYER INFO fields in SVC-15.
- **Today:** ~~none.~~ *[2026-10-13]* ~~CLAN RANKING drawn and inert (W18.R13, H188's default; with SVC-11 in sprint
  19);~~ *[2026-10-15, ONL-30 (merged at 406e46fd9, 2026-10-14; research 311): CLAN RANKING built and out of the parked
  rows (H188's default's condition met) over CLAN-BOARD-SERVER's three answers (053e82417, research 310 §6.2) -- THE
  PODIUM, the fourteen clans from the client's own, his clan tinted, the clan medal (`clanMedalOf`, `FUN_002ead80`),
  ON_LADDER_REFRESH, SOCOM II ONLINE's `ClanLadderTop10` under 766 filled; `CLAN_LADDER_MODES_PLACEHOLDER` retired;
  rendered by `menuClanRanking.spec` (dc386e095). Its reply chain freed of a request that never settles by
  CLAN-RANKING-STALL (merged at be1d62001; research 311 §3.7; LATER 51 struck, LATER 54 named). PLAYER INFO's CLAN
  origin from the roster by PLAYER-INFO-CLAN (merged at 36b8c5bd4; research 272 §5; LATER 42 struck).]* the players'
  pages are ONL-30a's (merged at 84407600c, research 269 §2).
- **Gap:** ~~the pages over SVC-13/SVC-15.~~ *[2026-10-13: PLAYER RANKING and PLAYER INFO built by ONL-30a; left: CLAN
  RANKING over SVC-11, sprint 19 -- Dependencies and the note below.]* *[2026-10-15, ONL-30 (406e46fd9): CLAN RANKING
  built (Today above); left: CLAN RANKING's down arrow after a stall and a re-entry (LATER 54), the proven level
  (ONL-32).]* *[2026-10-21: LATER 54 done (agent/later-54; the re-entry's released list raises no ON_LADDER_REFRESH).]*
- **Acceptance:** recomp captures with a seeded server, compared.
- **Proven by:** ONL-32.
- **Dependencies:** SVC-13, SVC-15, ONL-30a, SVC-11. **Size:** S.
- **Unknowns:** the sort key ("rating"?) -- SVC-13's reads.
- **Owner calls:** none.
- *([2026-10-04, OT.R18] web research 155 §2.2, §2.3, §3 read the pages from their records. **Corrected**: of
  395-398 only 395, 396 and 398 are `dlgLadderLobby`'s (397 PLAYER DESCRIPTION is `dlgOnlineOptions`';
  `tools/dump-dialogs.ts --msg-users 395 398`), and "the top ten" is also on the SOCOM II ONLINE menu itself
  (`dlgWorldOfSOCOM`'s `LadderTop10` and `ClanLadderTop10` under 765 and 766). **The sort key is answered**: the page
  asks the server for ladder stat 0 -- the rating -- in descending order (`LadderList_ExtraInfo0`: "TheBest", 10 rows
  from 1; "TheRest", 14 rows from my position less 2, paged by 14) and draws the rows by position: rating, name,
  position, medal, clan tag, my own row tinted. **The ranks** are the page's own legend, RANK INSIGNIA: ADMIRAL
  (TOP 10 PLAYERS), CAPTAIN (TOP 5%), LT. COMMANDER (NEXT 5-30%), LIEUTENANT (NEXT 30-85%), ENSIGN (LOWEST 15%),
  beside `Medal_Black`, `Medal_Gold`, `Medal_Silver`, `Medal_Bronze`, `Medal_Blue`. PLAYER INFO is a page inside
  this dialog (and inside four others), its medal a 28 x 28 column of the first list. No frame of any of these
  pages is archived. The players' half -- PLAYER RANKING, PLAYER INFO, the menu's top ten -- is ONL-30a (proposed
  below); CLAN RANKING stays here with the clans (H86 call 8).)*
- *([2026-10-11, PROMOTE-18] sprint 18's adoption ([its plan](../plans/2026-10-11-web-sprint-18-the-carried-and-the-players-pages.md), W18.R1, W18.R4):
  its players' half is **ONL-30a**, promoted below and placed in sprint 18, so ONL-30 names it. What is left here is
  CLAN RANKING (`dlgClanLadderLobby`), which goes with **SVC-11** to sprint 19 (W18.R1, the merge controller's split
  of 2026-10-11): its rows are the clans' ladder, whose rating is SVC-11's clan games, so SVC-11 is named too.
  **Re-sized M -> S**: one page of the two is left, PLAYER RANKING, PLAYER INFO and the menu's top ten being ONL-30a's.
  Whether OT.R40's unparking lifts the clans' ladder's parking (OT.R33, H86 call 8) is the plan's H-next a; until it
  is answered CLAN RANKING is drawn and inert (OT.R8). The Dependencies line read "SVC-13, SVC-15", its Size M.)*
- **Merged from:** online front end ONL-36.

### ONL-31 -- The online screens' music
- **Goal:** the looping VAG stream across the online screens, and the UI one-shots, as the original.
- **What the original does:** music started with the loop flag (flags 4), looped by the console (KNOWN
  [lobby-music-once]); the HUDUI one-shots (KNOWN [stray-oneshots]); the owner's desktop issue, socom-unzipped#94 (KNOWN [online-music-94]).
- **Today:** the front end's music streams exist since MENU-MUSIC (2026-10-03, web research 152: `packages/sound/src/musicStream.ts`, the viewer's `menuMusic.ts`; `MUS_ONLINE_MENU` from SOCOM II ONLINE on); this task's per-screen choice in the lobby is not built.
- **Gap:** per-screen stream choice on PLAT-22.
- **Acceptance:** the audio parity method against the console capture (`logs/parity/s17_a1_lobby_ours/` vs the console
  reference).
- **Proven by:** PLAT-36 (the audio runs); ONL-32.
- **Dependencies:** PLAT-22, PLAT-23. **Size:** S.
- **Unknowns:** which stream each screen plays; what the owner found wrong in #94 (not yet written down).
- **Owner calls:** none.
- **Merged from:** online front end ONL-38.

### ONL-32 -- The online reference set: captures and Medius transcripts
- **Goal:** the recorded reference every ONL and SVC task validates against: a capture per screen and state, and for
  service actions the Medius request/response pair and the DB diff.
- **What the original does:** existing: `s4_pcsx2` A/B; `s17_q2_logoff/online1`; the `refs/` crops; the PC research 66
  rounds. Missing (PC research 80-online-menus §3-4): the menu walk, AUTOPLAY, OPTIONS, clan pages, friends, ignore,
  rankings, player info, the DNAS screen, round and final screens, spectating, errors, the PLAYER LIST.
- **Today:** none.
- **Gap:** one walk per row of N6 and each page under it, on the **local** stack with a throwaway `simulated.db` and two
  personas; for each step: a capture (our recomp, pixel-exact, N20); the Medius pair from Horizon's MLS log at a level
  that records each message; `seed-simulated-db.ps1 -Show` before and after. The window takes every online capture the
  proven levels name, so it is spent once: ONL-01 (the slot popup; `netcfg*` provenance), ONL-03, ONL-07, ONL-08,
  ONL-09, ONL-12, ONL-15..ONL-31; every SVC transcript (SVC-01..SVC-23); a recomp online round with START pressed and
  the HUD captured row by row, and ABORT confirmed (MATCH-01, MATCH-02); the card after an ARMORY store (OPT-20). Traces
  are PLAT-36's.
- **Acceptance:** a committed index (captures git-ignored; no disc bytes) where each step names its capture, transcript
  and DB diff; two runs of the same script give the same transcript modulo ids and times; rows land in PLAT-31.
- **Dependencies:** an owner window (loop lock; R293: local stack only). **Size:** L.
- **Unknowns:** whether Horizon's log records each request at the tracked level; whether console flows depend on
  server behaviour Horizon lacks (DeleteClanMessage, ClanTeamChallenge, buddy confirmation).
- **Owner calls:** the run window.
- **Merged from:** online front end ONL-40; services SVC-02.

### ONL-33 -- The online dialogs read from the disc (PLAT-06's online chapter)
- **Goal:** the online chapter of PLAT-06's note: every online dialog's captions, UI commands, keyboards and their
  limits, and the UI vars they bind, regenerated by PLAT-06's test.
- **What the original does:** N1-N3; the `GetTextInput` blocks (chat `ChatSkb`, `PlayerChatSkb`; PC research 66 §1);
  SOCOM 1's shapes in reCOM (`research/recom/data/s1/common/dialog/*.rdr`: dlgOnlineOptions `SkbMaxChars = 13`,
  dlgCreateClan, dlgLadderLobby, dlgInvitedPlayers, dlgRespondToInvites -- structure only, not SOCOM II facts); the UI
  vars of SVC-16/SVC-13 (FriendInfoName/Game/Lobby, FriendConfirmationListVar, LADDER_LEADERS, ...).
- **Today:** `uiZanim.ts`, `uiLoc.ts`, `uiLayout.ts` read the format.
- **Gap:** the list for MESSAGES, AUTOPLAY, CLAN pages, rankings, OPTIONS, FRIENDS, IGNORE, invitations; keyboard caps;
  ~~the clan icons (`clan_icon_NN`) that exist.~~ *[2026-10-15, CLAN-DIALOGS-READ (merged at 2d2182332; research 331):
  the clan pages', the invitations' and CLAN RANKING's captions, commands and keyboard caps read from the disc's dialogs
  through the repository's readers and held by `tools/test/clanDialogsDisc.test.ts`, no difference from the port
  (R331.7); the clan icons settled -- none on the disc, the index always 0 (R128.13, R262.4; W19.R14). The list's other
  pages (MESSAGES, AUTOPLAY, PLAYER RANKING, OPTIONS, FRIENDS, IGNORE) not re-checked by that row.]*
- **Acceptance:** the chapter cites each dialog member and command and is regenerated by PLAT-06's test (one test, one
  note); each caption checked against ONL-32's captures (the proven level).
- **Proven by:** ONL-32.
- **Dependencies:** PLAT-06. **Size:** M.
- **Unknowns:** ~~which keyboard limits the clan name, clan message and description;~~ *[2026-10-15, CLAN-DIALOGS-READ
  (2d2182332; research 331 R331.2): read off the disc -- the clan name `MPPLAYERNAME` 13 characters / 31 bytes (#224),
  the clan message `ChatSkb` 199 / 199 (#497; `SKB_FIT_READING` may stop it earlier, R331.5), the "description"
  `Clan_Description`, the clan tag, `MPPLAYERNAME` 3 / 15 (#499; "description" an inference); the page's keyboard takes
  each block's caps from the disc (R331.3).]* whether AUTOPLAY belongs here.
- **Owner calls:** none.
- **Merged from:** services SVC-03.

## Proposed (OT.R23, web research 170): the lobby's voice UI, not in the graph until the controller places it

Written 2026-10-05 by OT-14 (the online-path plan's OT.R23); **promoted 2026-10-07 into sprint 20**. Research
170 §7.2 originally proposed sprint 17, but that sprint closed before the placement was carried into SPRINTS.md; the
closed sprint is not rewritten.

### ONL-16b -- GAME LOBBY's voice: the talk icon, who is talking, CIRCLE held
*([2026-10-08, web sprint 20] built on `agent/online` -- ONL-16b: the lobby's push-to-talk through the original's own mechanism (`VCButton`, `CheckForcedLaunch`'s `can_talk` and `PLAYERTACOVAR`; research 227 §1), one talk input through the hand-off, merged 33e7071e9; the plan `../plans/2026-10-08-web-sprint-20-voice.md`, its Log.)*
- **Slice of:** ONL-16 ([2026-10-05, OT.R23]): the lobby's voice, which ONL-16a left out ("without chat and voice")
  and ONL-16 kept with its chat; the voice itself is SVC-20b's.
- **Goal:** the game lobby's voice indicators and button as the original draws and binds them: CIRCLE held talks to
  every player in the lobby, the bottom-left icon shows the player's own talk, the bar beside it names who is talking.
- **What the original does:** web research 170 §4.1, §5.1: `dlgGameLobby`'s `talk` (`action_ok_talk2.tif`),
  `notalk` (`action_no_talk2.tif`), `Talker_back` and `TalkerName` on `PLAYERTACOVAR`; CIRCLE's `do_team_button_down`
  / `_up` (`VCButton(1T)` / `(0T)`: the talk flag set and cleared, ELF 0x27e1c0-0x27e2a0) and
  `do_circle_button_down` (the icon by `can_talk`); the bar filled by `CheckForcedLaunch` (`FUN_0027cbf0`
  D:L125653-125681) with the holder's `#C`-coloured `[clan] name` or a blank; a late joiner's caption hidden
  (`SetupLateJoiner`) and his press inert; the ARMORY row turning voice off (`InitializeOnlineArmory`, `FUN_0027d8c0`)
  and the return putting him on channel 9 (`SETMENUSTATE`, `FUN_0027c9f0` D:L125562); spectators on channel 10.
  N13's frames (`A_54_gamelobby2.png`; `s11_r0004_round1/A_17_game_lobby_ok.png`) show the box and the empty bar.
- **Today:** ONL-16a draws the box idle and CIRCLE answers nothing (OT.R8).
- **Gap:** the icon's two states, the bar's text from the room's floor table (the holder on the listener's channel,
  never himself), the press and release wired to SVC-20b's talk, the late joiner's and the ARMORY's rules; the
  menus' R (CIRCLE, PLAT-11's `MENU_KEYS_READING`) held is the keyboard's -- a labelled adaptation.
- **Acceptance:** unit tests of the bar's text (`[clan] name`, the name alone, blank) and the icon from a table and a
  `can_talk` value, against `FUN_0027cbf0`'s and the animations' cites; the idle lobby compared with `A_54`'s box and
  bar (empty); a two-browser e2e: A holds R, B's bar shows A's name and A's icon shows talk; A releases, B's bar is
  blank; a late joiner's caption hidden. *[2026-10-15, AD-13 (merged at 501869ea4): the bar's `[clan] name` case built
  -- the talker's tag from the room's `seatClans` (`FUN_0027cbf0` D:L125668-125677), with the game lobby's side lists'
  clan column; `TALKER_CLAN_PARKED_READING` retired (research 227 §3, 275 §5 item 5); LATER 43 built.]*
- **Proven by:** ONL-32's window (a capture of the game lobby with a talker: `VOICE_INDICATOR_LOOK_PLACEHOLDER`).
- **Dependencies:** ONL-16a, SVC-20b, SVC-22. **Size:** S. **Then:** ONL-16 (the chat left in it).
- **Unknowns:** `VOICE_LOBBY_BUTTON_EDGE_READING`, `VOICE_LATE_JOINER_READING`, `VOICE_ROW_MARK_READING`,
  `VOICE_INDICATOR_LOOK_PLACEHOLDER`, `VOICE_TALK_SOUND_READING` (research 170 §10).
- **Owner calls:** H87 VOICE-DIFFERENCES (spectators apart, late joiners silent, no voice in the briefing room).
- *([2026-10-04, R170-FIX] research 170 §5.1 corrected against the R2-AV card (strong; the lines of `FUN_0027cbf0`
  re-read). **The goal stands for the bar and the icon**: they are the original's, so they are built as such. **The
  game lobby has no talk mark on the player rows** (the rows are plain names), so a mark beside each name would be ours,
  not the original's. OT.R32 / H87 chose the original voice UI only: **the bar and icon, no per-row talk mark**. No
  sound on press, busy or release. The icon shows "talking" only while the player is recording and "no talk" while he
  waits on a busy floor; the bar is blank for the listener's own talk. The lobby is never voice-modulated (SVC-22). The
  button edges are proven: CIRCLE pressed = press, released = release, held = the icon each frame; held past 10 s the
  floor cuts and the key still held talks again at 20 s (SVC-20b). A late joiner's press is inert and his bar hidden
  (the late-joiner valve). `VOICE_ROW_MARK_READING`, `VOICE_TALK_SOUND_READING`, `VOICE_LATE_JOINER_READING` and
  `VOICE_LOBBY_BUTTON_EDGE_READING` are resolved; `VOICE_INDICATOR_LOOK_PLACEHOLDER` stays open.)*
- **Merged from:** new (research 170 §7.1), out of ONL-16's voice half and SVC-22's "the indicator".

## Proposed (OT.R18, web research 155): not in the graph until the owner has read the plan

Written 2026-10-04 by OT-12 (the online-path plan's OT.R18). The two blocks below are in the segment's form but under
`####` headings, so that the dependency graph, the README's table and map and SPRINTS.md do not count them yet. When
the owner has answered HUMAN_TASKS H86 the controller promotes each to a `###` block among the Tasks, adds ONL-30a to
ONL-30's Dependencies, and brings the README, the capability matrix, SPRINTS.md and the graph test's count with them
(research 155 §5).

*Promoted 2026-10-11 (PROMOTE-18): the condition is met -- H86 answered 2026-10-04 (OT.R33: "the other calls by research
155's recommendations") -- and the merge controller adopted [sprint 18's plan](../plans/2026-10-11-web-sprint-18-the-carried-and-the-players-pages.md) the
same day under the owner's delegation (W18.R4). ONL-30a and ONL-34 are `###` tasks, their text kept; ONL-30 names
ONL-30a (and SVC-11, for CLAN RANKING: W18.R1, its dated line); ONL-34 names SVC-07c (SEAT-TOLD, segment 06) and
ONL-30a beside its own three (W18.R7, its dated line). The README's table, totals and map, SPRINTS.md, the capability
matrix and the graph test's count (172 -> 179, with segment 06's five) moved with them.*

### ONL-30a -- PLAYER RANKING and PLAYER INFO, and the menu's top ten (without the clans' ladder)
- **Slice of:** ONL-30 ([2026-10-04, OT.R18]): the players' pages -- PLAYER RANKING, the PLAYER INFO page reached
  from it, and the SOCOM II ONLINE menu's top-ten panel -- without CLAN RANKING, which needs the clans whole (ONL-30,
  parked with them).
- **Goal:** the PLAYER RANKING row of the menu opens the ladder page as the original draws it, with THE PODIUM, the
  page around the player, the legend, and PLAYER INFO on CROSS.
- **What the original does:** research 155 §2.2, §2.3, §3: `dlgLadderLobby` -- `LadderTop10` (`LADDER_LEADERS`:
  position, name, tag), `LadderList` (`LADDER_RANKING`: the account key off the screen -- *not the rating, corrected 2026-10-12, research 269
  §2.4* -- name, position, a medal column, tag; my row tinted),
  the RANK INSIGNIA legend (five ranks, five medals, five bands), captions 396, 151, 398, 395; ONSTART
  `get_ladder_top_10` (`ClearUIVar(LADDER_LEADERS)`, `GetLadderInfo`), L1 / L2 `ladder_up` / `ladder_down`,
  `ON_LADDER_REFRESH` -> `RefreshArrows`, CROSS `playerinfo_activate` (`GetPlayerInfo`), MP_PLAYER_NOT_FOUND;
  `GetLadderInfo`'s modes (web research 97 §2.2); the PLAYER INFO page inside the dialog (`playerinfo_list1` with its
  medal column, `playerinfo_list2`, `playerinfo_description`; 863, 864), filled by `FUN_002f0020` (V11);
  `dlgWorldOfSOCOM`'s `LadderTop10` under 765 and `DisplayMedalOfMerit` on `ON_LADDER_REFRESH`.
- **Today:** ~~the menu's PLAYER RANKING row is drawn and inert (ONL-09, OT.R8).~~ *[2026-10-12, merged at 84407600c;
  research 269 §2]* PLAYER RANKING from `dlgLadderLobby`: THE PODIUM's ten, the fourteen rows from my position less 2
  with my row tinted, the paging, the RANK INSIGNIA legend, each row's medal by `FUN_002eaee0`; PLAYER INFO on CROSS in
  V11's order with TOTAL PLAYING TIME; the SOCOM II ONLINE menu's top ten and its `DisplayMedalOfMerit` on the position
  reply. CLAN RANKING stays inert (W18.R1).
- **Gap:** ~~the page from its record through the dialog runtime; `GetLadderInfo` and `GetPlayerInfo` over SVC-13 and
  SVC-15a; the menu's panel.~~ *[closed 2026-10-13: built, Today above (ONL-30a, 84407600c); CLAN RANKING with SVC-11, sprint 19.]*
- **Acceptance:** reading level: the dialog's widgets, columns and commands held to its record (PLAT-06's chapter);
  a page test over a seeded ladder: the podium's ten, the fourteen rows from my position less 2, the paging, my row's
  tint, each row's medal equal to `FUN_002eaee0` of its position, PLAYER INFO's fields in V11's order with TOTAL
  PLAYING TIME. Proven level: no frame of these pages is archived (research 155 §3) -- ONL-32's capture, which needs
  a server that answers the list (our Horizon answers it empty).
- **Proven by:** ONL-32.
- **Dependencies:** SVC-13, SVC-15a, ONL-09. **Size:** M. **Then:** ONL-30 (CLAN RANKING).
- **Unknowns:** every frame; `DisplayMedalOfMerit`'s ops (the set's decode); the page's presence lines for a player
  seen from the ladder (the row's online state: what our server puts there is the owner's call 9).
- **Owner calls:** what a profile and the ladder's rows show whom (H86 call 9).
- **Merged from:** sliced from ONL-30 by OT-12 (2026-10-04, OT.R18).

### ONL-34 -- The medal of merit: beside the persona's name, and in the game lobby's lists
- **Goal:** a player's rank shown wherever the original shows it outside the ranking pages: the medal beside his own
  name at the foot of the online screens, and beside each player in the game lobby's two team lists.
- **What the original does:** research 155 §2.3, §3: of the disc's 103 dialogs, sixteen carry `playername`
  (`PLAYER_NAME_AND_TAG`) with five medal images as its children; fifteen run `ActivateMedalOfMerit` (UIanim.rdr) at
  ONSTART, and the sixteenth, `dlgWorldOfSOCOM` (SOCOM II ONLINE), does not -- it binds its own
  `DisplayMedalOfMerit` on `ON_LADDER_REFRESH` only *(corrected 2026-10-04, on review)*; the valves
  `LadderMedalOfMerit` and `LadderRankRestriction` are set from the position answer (`FUN_002eb010`
  D:L188994-189051, `FUN_002eb340` D:L189117-189180) by `FUN_002eaee0` and `FUN_002eae20`; each player publishes his
  medal and rating in his player state (`FUN_002c5360` D:L166181-166213, the name `oop9` always medal 4), and the
  game lobby's `B_SEALLIST` / `B_REDLIST` draw it in their second column (`FUN_002c5010` D:L166061-166178; TEXTURES
  `null`, `Medal_Blue`, `Medal_Bronze`, `Medal_Silver`, `Medal_Gold`, `Medal_Black`). On the archived frames the
  medal is the Admiral's star for everyone: a ladder under 12 (`A_45_lobby2.png`, `A_54_gamelobby2.png`).
- **Today:** *[2026-10-12, after ONL-30a; research 269 §2]* the two valves `LadderMedalOfMerit` and
  `LadderRankRestriction` are written by ONL-30a's position replies (`FUN_002eb010`, `FUN_002eb340`, as the original's
  reply bodies do), and SOCOM II ONLINE's `DisplayMedalOfMerit` shows the medal once the position is answered (tested);
  the fifteen ONSTART dialogs' `ActivateMedalOfMerit` reads the valve~~, its ops not yet decoded~~. Before ONL-30a: the
  valve was 0 and no medal showed.
  *[2026-10-13, merged at e01267af6; research 269 §4]* both sets' ops decoded (§4.1: one medal shown by
  `LadderMedalOfMerit` == 1..5, the compare's op byte 2 equality, `FUN_00353fd0`); the position is asked nowhere else
  (§4.3); the game lobby's two lists draw each seat's medal from SEAT-TOLD's board, at each `seatTold` and at the match's
  return (§4.4, W18.R7).
- **Gap:** *[2026-10-13]* built at e01267af6 (Today, above); left: the proven level (the star against `A_45_lobby2.png`
  and `A_54_gamelobby2.png`, the owner's window; ONL-32). It read: ~~first, the decode of both sets' ops --
  `ActivateMedalOfMerit` and SOCOM II ONLINE's `DisplayMedalOfMerit`,
  whose mechanism is the undecoded one on the very screen the acceptance tests; then both run from their ops; the
  position asked at the moments the original asks it (besides the ranking page and the menu, ONL-30a's); the two
  valves are ONL-30a's, not written a second time here; the lobby lists' medal value from the server's record at a seat's join and after each round (research 155
  §4.4), not from the page.~~
- **Acceptance:** reading level: page tests -- for each medal value 0-5 the right image beside the name on the
  SOCOM II ONLINE menu, drawn when the ladder's answer arrives by `DisplayMedalOfMerit` as decoded, and on one of the
  fifteen ONSTART dialogs by `ActivateMedalOfMerit`; the lobby's lists carry each seat's medal; a seeded ladder under 12 gives every player the
  star, as the frames show. Proven level: the star's place and size against `A_45_lobby2.png` and
  `A_54_gamelobby2.png` (they exist); the other four medals need a ladder our Horizon cannot give (ONL-32, or the
  owner's frames of the original).
- **Proven by:** ONL-32.
- **Dependencies:** SVC-13, ONL-09, ONL-16a, SVC-07c, ONL-30a. **Size:** M.
- *([2026-10-11, PROMOTE-18] promoted at sprint 18's adoption; W18.R7 of [its plan](../plans/2026-10-11-web-sprint-18-the-carried-and-the-players-pages.md):
  the lobby lists' medal comes from the server's record at a seat's join and after each round (research 155 §4.4) --
  SVC-07c's event (SEAT-TOLD), never the page's own arithmetic -- and the position is asked over ONL-30a's ladder
  client, so both are named; the line read "SVC-13, ONL-09, ONL-16a". The `oop9` case is kept as the original's under
  the parity rule; the plan's H-next b says so to the owner.)*
- **Unknowns:** `ActivateMedalOfMerit`'s and `DisplayMedalOfMerit`'s ops (the sets' decode, this task's first
  step); when the original asks its position besides the
  ranking page (the callers of `FUN_002eafb0`, not read); whether the `oop9` case is kept (it is the original's;
  the parity rule keeps it unless the owner says otherwise).
- **Owner calls:** the ranks' bands on a small ladder (H86 call 4).
- **Merged from:** new (research 155 §5, B4); the rank icons of the rooms list, the game's details and CREATE GAME
  stay with ONL-11, ONL-12, ONL-13 and SVC-14a / SVC-14.
