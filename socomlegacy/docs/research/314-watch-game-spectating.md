# 314 -- WATCH GAME: spectating an online game (ONL-21)

- Date: 2026-10-13 (web sprint 19's online seat; roadmap 05 ONL-21 "Spectating (WATCH GAME)"; written before its build,
  no code changed with it).
- Status: **reading** (reviewed 2026-10-13 by a fresh reviewer: PASS WITH FINDINGS, high, its findings folded the same
  day -- F1 SWITCH TEAMS lit for a watcher of an ordinary game and READY's 10 s count, §4.1; F2 the port's rank refusal
  of a watcher, §3.2 and W8; F3 CREATE GAME's write of `MaxSpectatorsValve`, §3.1; F4 the pad's bytes by function, §5.3;
  F5 the spectator's own clan tag, §5.2; the values the fold adds are re-read at the source by its author and stand
  as reading, pending review, until the next reviewer re-reads them). *2026-10-14, WATCH-JOIN (web sprint 19's second
  half, W19.R8): §7 items 1, 2 and 8 built -- the services' security level 4, the watcher bounded by the sum and refused
  "Too many spectators" by the room, the rank gate a player's only -- and one finding against this note: the briefing
  room's spectator-password keyboard is titled #423, not #252 (§2.1); reading, pending review.* *2026-10-14, LATE-WATCH
  (W19.R12): §7 item 3 built in its corrected form and one finding against this note -- YES to #352 / #353 only waits,
  and a late seat's READY is what loads it (`ReadyToLoad`'s late branch, §4.2), the watcher and the ghost alike;
  `READY_LOADS_LATE_JOINER_READING` replaces `LATE_WATCHER_IN_PROGRESS_READING` (§8); reading, pending review. That read
  also uses the ELF's instructions (`game/disc/socom2_game.elf`, disassembled outside the tree), cited by address, where
  the decompiler drops a call's argument.* *2026-10-14,
  SPECTATOR-VIEW (W19.R8, 314's ONL-21b slice): §7 items 4, 5 and 6 built in `hud.ts` (the info box only, W19.R11) and
  `spectatorView.ts` -- "[tag] name", the jump with no alive test, the scenic view's live look and zoom -- each re-read at
  the source by its author (`FUN_00238500` D:L85559-85576, `FUN_00294f40` D:L139398-139424, `FUN_002964f0`
  D:L140398-140528, `FUN_00295260` D:L139485-139578, `FUN_002956e0` D:L139687-139697); one new name,
  `SCENIC_LOOK_AXES_READING` (§8); reading, pending review. No disagreement with this note or research 248 was found;
  W6's page half (the clock and the projection, `netPage.ts` and `matchNet.ts`) was held for the seat's word and built the same day on it (§7 item 6). The fresh review (FAIL, one blocking finding, folded the same day): B1 the scenic pitch takes INVERT PITCH (`DAT_003df198`, §8's `SCENIC_LOOK_AXES_READING`); N1 `FOLLOW_OFF_DEAD_READING` named (§8); N2 stale lines re-filed.* *2026-10-14, WATCH-DOCS (W19.R8,
  §7 item 7): roadmap 05's ONL-21 block brought up to what the half built (R314.8's stale unknown struck, the captions'
  words of §2.1 with #423), research 154 §6's departure found re-filed by WATCH-JOIN, the `JoinMPGame` doc cite corrected
  (§2.2), and `WATCH_NO_SLOT_STALE_VALVE_READING` pinned by a test, green at once on the port's code (§3.1, §8); reading,
  pending review.* *2026-10-15, NU-11 (the next-update checklist's batch 2; the owner's question, NU.R4): §4.3 added --
  the late joiner's ghost read at the source (`FUN_002b7d60`, `FUN_00543d50`, `FUN_00592560`, `FUN_001f97b0`): it is
  drawn on no console and watches its living teammates in the dead player's teammate cycle until the next round, not
  in the spectator's camera; the front end's hold of the ghost's input lifted (`lobbyMatch.ts`), the two drawing fixes
  held for the gameplay seat (`remotePlayers.ts`, `play.ts`); R314.9; `GHOST_OWN_PLACE_READING` (§8, note only);
  reading, pending review.* *2026-10-16, AD-8 (web sprint 40, the reconciliation's C83): §5.4 added -- the followed
  player's death, departure and deletion re-read at the source (`FUN_002998f0`, `FUN_00296f10`, `FUN_00297410`,
  `FUN_002980d0`, `FUN_002bef60`, `FUN_005998b0`, `FUN_0029fbc0`, `FUN_0029f510`, `FUN_0029f850`): the three
  distinctions at reading (chunk 14's review, W40.R4); one finding beyond the chunks -- the death camera's killer and
  saved-actor rebinds run offline only and never for a spectator's follow (§5.4 item 1.4); three proposed names (§8);
  the additions reading, pending review. Built the same day on the seat's word (the choice of readings logged for the
  owner): `spectatorView.ts` keeps the dead body and rebinds no one, keeps a leaver retired and deletes one a frame;
  `FOLLOW_OFF_DEAD_READING` retired, the three names in code (§8).* Every
  value of the original below is read from the retail decompilation (`socom2_game.elf.decomp.c`, `D:L<n>`,
  `FUN_<addr>`; cited, never pasted), the ELF's strings (`socom2_game.elf.strings.txt`, `S:0x<addr>`), the disc's
  scripts as the repository's pinned dump holds them (`tools/test/onlineDialogs.pinned.json`, cited `P:L<n>`:
  `dlgWorldOfSOCOM.rdr`, `dlgMPBriefingRoom.rdr`, `dlgCreateGame.rdr`, `dlgGameLobby.rdr`,
  `dlgMultiplayerFinalReally.rdr`), and the captions' ids as the loc reader's golden pins them
  (`packages/scene/test/golden/locTables.json`). **The captions' texts** are a byte read of
  `RUN/LOCALE/STATES/UIMNLOC.ZAR` (the archive `uiLoc.ts`'s `UIMNLOC` names), each the string stored after its
  `MSG_ID` -- source inspection, not the reader's run; `tools/dump-online-dialogs.ts --dialog dlgMPBriefingRoom.rdr`
  (or `parseLocTable` over that archive) is the reader that confirms them. Two valves' lifetimes rest on a byte search
  of `RUN/READERC.ZAR`'s names table (research 309 §2.3's). **No test was run for this note** (source inspection only;
  no node, no browser). Nothing here is measured on the original running -- ONL-32's spectator capture is the proven
  level.
- Stands on research [308](308-clan-games-joining.md) (§3.1 `aux_join_game` and #524 before the watch is read, §3.2
  the host's Game Signal side 4 and its reasons, §8 `CLAN_CLOSED_WATCH_READING`), [309](309-clan-games-the-swap-after-a-game.md)
  (the return to the GAME LOBBY after a full game, ONL-20b), [91](91-the-round.md) (§12 the spectator's help lines),
  [154](154-the-briefing-rooms-and-the-game-list.md) (§6 the spectator password and the spectator slots at JoinGame),
  [162](162-the-briefing-room-the-join-and-the-game-list.md) (the room's screen), [163](163-create-game.md) (the
  spectator password at the create), [165](165-the-game-lobby-to-the-launch.md) (§1 the join, §2 the lobby, the late
  joiner), [179](179-c1-match-server.md) (§6.11 `late_joiner`, §9.6 the pad's slots), [193](193-m2-mp-net-replication.md)
  (the message list), [225](225-voice-floor-and-channels.md) (the spectators' channel), [232](232-the-view-as-built.md)
  (§5 the spectator's pad, the cycle), [248](248-the-original-spectator.md) (the spectator camera, F1-F6),
  [264](264-the-results-path-and-the-ladders-guards.md) (§4.2 VOTE ALL, §4.5 "Too many spectators" on the page),
  [266](266-the-chat-panels.md) (§3.1 the chat's scopes, §8 the START menu and ABORT), [269](269-the-players-pages-and-the-medals.md)
  (§5 the scoreboard's spectators), [275](275-the-clan-tag-in-a-round.md) (§5 the spectator's info box) and
  [282](282-the-spectator-hud.md) (the spectator's HUD), and does not restate them.
- Code as read (nothing changed): `packages/ui/src/screens/gameLobbyCommands.ts` (`JoinMPGame`, `joinGame`'s join type,
  `GameHasSpectatorPassword`, `PLAYER_TEAM`, `sideTeam`, `gameLobby`, `roundStart`, `seatEnded`,
  `TOO_MANY_SPECTATORS_TEXT`); `packages/ui/src/screens/briefingRoomCommands.ts` (`gameListRow`'s SPEC and SPEC MAX);
  `packages/central/src/lobby.ts` (`SECURITY_LEVEL`, `createGame`'s security level, `joinGame`,
  `SPECTATOR_PASSWORD_READING`); `packages/central/src/bridge.ts` (the seat's `watch` from the member's join type,
  `ABANDON_TRIGGER_READING`); `packages/match/src/gameLobby.ts` (`PreMatchRefusal 'spectator'`,
  `READY_SEATS_READING`); `packages/match/src/room.ts` (`hello`, `TOO_MANY_SPECTATORS`, "The game is full.");
  `packages/viewer/src/net/lobby.ts` (watchers held to `maxSpectators`); `packages/viewer/src/gameLobbyHost.ts` (the
  game socket's hello, no `watch`); `packages/viewer/src/online.ts` and `netPage.ts` (the map viewer's `watch`);
  `packages/viewer/src/spectatorView.ts`, `hud.ts`, `startMenu.ts`.

## 1. The answers

| row | answer | where |
|---|---|---|
| R314.1 | **The one way in is the BRIEFING ROOM's WATCH GAME.** Its button (`WatchGame`, #406 "WATCH GAME", P:L4033) sets `WatchOrJoin` 1 on focus (`OnWatchGamestart`, #416 the help, P:L4340-4351); CROSS hands GAMELIST the focus (`OnJoinBtnPress`, #418 "There are no games to join." on an empty list for either button, P:L4421-4434); the list's help is #413 (P:L4382-4390); a row's CROSS runs `join_game`, which sets `JoinAsSpectator` 1 and calls `aux_join_game` (P:L4549-4558). No other script sets `JoinAsSpectator` 1 (P:L4556 is the dump's only write of 1; WORLD OF SOCOM's joins and CREATE GAME's init write 0, P:L3633, P:L3691, P:L5835), so the GAME LOBBY has no watch entry and a seated player cannot become a spectator (SWITCH TEAMS moves between the sides only, 308 §4.3). #417 "There are no games to watch." and #419 "Join game as a spectator." are used by no online dialog's script. Built: the page runs the disc's scripts. | §2.1 |
| R314.2 | **What the client sends: JoinGame with join type 1 and the spectator password, then its join request with mask 1.** `aux_join_game` asks #524's clan test first (308 §3.1), skips the rank test for a watch (P:L4571), asks `GameHasSpectatorPassword` -- the listed game's security level & **4** (`FUN_002f8d50` D:L197495) -- and opens #252 "Enter Spectator Password" on `SpectatorGamePassword` (P:L4593-4606; *2026-10-14, WATCH-JOIN: the keyboard's title is #423 "Enter a Password to Connect.", the command's own, not #252 -- §2.1*); `JoinMPGame` (`FUN_002f83b0`) answers 1 at once, sending nothing, for a watch of a game whose spectator slots (+0x19e, GameStats byte 4) are 0 (D:L197175-197178); else state 15 sends JoinGame with join type 1 and the spectator password (`FUN_002eda60` D:L190376-190395); the host's join request carries mask 1 (`FUN_0030d380` D:L209966-209968). Built, but **the services never set the security level's 4** (`lobby.ts` sets only `None` / `PlayerPassword`), so the page never asks a spectator password and a watch of a game that has one is refused "Password incorrect." unasked. *Built 2026-10-14 (WATCH-JOIN W1): the services set 4 beside 1 (`SPECTATOR_PASSWORD_SECURITY_BIT_READING`).* | §2.2 |
| R314.3 | **SPEC/MAX is GameStats byte 4, the creator's `MaxSpectatorsValve`** (0 or 8 online, 0 or 4 on a LAN: research 203's SPECTATORS row; byte 4 `FUN_002f7c40` D:L196730-196731, byte 3 the host's spectator count, D:L196729); the row draws SPEC MAX as byte 4 and SPEC as byte 3 capped by it (`FUN_002e2ce0` D:L184418-184437, built: `gameListRow`); `JoinMPGame` copies byte 4 into the joiner's `MaxSpectatorsValve` (D:L197206-197218), after the no-slot test. **The host's limit is its own `MaxSpectatorsValve`** (S:0x3f2680, 8 when absent) against its spectator count `DAT_00441458` (`FUN_002bc620` D:L161395-161401; §3.2). | §2.3 |
| R314.4 | **The refusals.** Before any request: #524 (308 §3.1); #424 "You cannot be a spectator in that game. Please try a different game." when `JoinMPGame`'s early return meets `MaxSpectatorsValve` 0 (P:L4618-4627) -- but the valve is a global one the early return has not written, so after a join of a game with spectators the watch of one without waits, re-asking, until `monitor_timeout`'s #440 "Timeout Failure" at 30 s (P:L4629-4632, P:L4708-4714; `WATCH_NO_SLOT_STALE_VALVE_READING`) -- and merely opening CREATE GAME after a join writes the valve 8 online (`init_cg_screen`'s default branch, P:L5797, P:L5821-5825), so #440 is the common answer and #424 the rarer. At JoinGame: -978 "Password incorrect.", -972 #443 / #444, any other #441 "Game Full or Locked" (165 R165.3). At the host: **reason 2 "Too many spectators"** when the count is at the valve (D:L161395-161424), shown through MP_EJECT_SPECTATOR -> `spectator_rejected` (#527 on JoiningAnim, the popup, back to the BRIEFING ROOM; or the GAME LOBBY's, `ReturnToBriefingRoom`); no clan refusal for a watch (308 §3.2); no lock (309 §4.1); the LAN-only password hash (D:L161303-161325) never online. The port refuses a watcher past the slots at JoinGame (#441), and its room with "The game is full." -- not the host's "Too many spectators" (`WATCH_SLOTS_HOST_REFUSAL_READING`); and **it refuses a watcher by rank** (`lobby.ts` `joinGame`, any non-host, `RANK_REFUSED_STATUS_PLACEHOLDER` -> #441), where the original checks rank for a player only (P:L4571) and neither Medius server checks it (research 261's `RANK_GATE_ON_SERVER_ADAPTATION` row): a watcher of another tier's game is admitted by the original (W8; corrects research 261 §10.4). *Built 2026-10-14 (WATCH-JOIN W2, W8): the services bound a watcher by MaxPlayers only and the room refuses one past `maxSpectators` "Too many spectators" (`WATCH_SLOTS_HOST_REFUSAL_READING`); the rank gate judges join type 0 only.* | §3 |
| R314.5 | **What the watcher joins.** A game in its lobby: the GAME LOBBY with its seat in the SPECTATORS column (`player_team` 16), the ARMORY disabled (P:L7133-7136, P:L7414-7420; `ArmButtonClock` skips its count, P:L7001), **SWITCH TEAMS lit** in an ordinary game -- `Enable_SM_Launch` disables it for team 16 and then, for a seat neither master nor late, calls `SetupNormalJoiner` (P:L7217-7222), which re-enables it whenever `IsSwitchTeamsOK` (`FUN_002f8ce0` D:L197467-197474: 1 unless the clan option is 1, 2 or 4) answers yes (P:L7279-7281), with no team test; its press does nothing (the host's move `FUN_002c4290` acts on the two side words only, D:L165538, D:L165555; a watcher's is 0x10000) -- READY disabled for `ClientDAReadyButton`'s 10 s count and then live (P:L7283-7285, P:L7831-7856) and never counted (`FUN_002c40c0` counts the non-0x10000 seats, `READY_SEATS_READING`); the launch takes it into the match with the players. A game already launched: #352 "This game has already started. Would you like to spectate the game in progress?" (P:L7257-7259), NO leaving the lobby; YES -- the console's late flag is cleared at the level's load and the ghost flag set for a non-spectator only (`FUN_001f5e70` D:L55715-55728), so the watcher **watches the round in progress**, where the port waits for the next round start (`LATE_JOINER_NEXT_ROUND_READING`; `LATE_WATCHER_IN_PROGRESS_READING`). *Corrected 2026-10-14 (LATE-WATCH, W19.R12; §4.2): YES only waits; the late seat's READY loads it into the round in progress (`ReadyToLoad`'s late branch, `FUN_0027caf0` D:L125606-125608), the watcher and the ghost alike -- built (`READY_LOADS_LATE_JOINER_READING`).* Built: the lists, `player_team` 16 (`sideTeam(null)`), SWITCH TEAMS lit by the script (`IsSwitchTeamsOK` answers 1, `gameLobbyCommands.ts`), the room's 'spectator' refusals of READY and SWITCH TEAMS (a refused SWITCH TEAMS matching the host's no-op). | §4 |
| R314.6 | **What it sees and hears in the match** -- built, from earlier rows: the free camera at entry, X / Up / Down / Triangle on release, Right / Left the cycle through every living non-spectator (`FUN_00295260` D:L139463-139590, `FUN_00592560` D:L451681-451694, `FUN_00546fa0` / `FUN_00547170`; research 248, 232 §5; PF-31, PT-19b), the spectator HUD and its help lines (research 282, PAR-48; 91 §12), the START menu's spectator rows and ABORT to SOCOM II ONLINE (266 §8, MATCH-02), voice on channel 10 in the lobby and the round (225, `VOICE_SPECTATOR_CHANNEL_READING`), a TEAM line to the spectators only (266 §3.1), up to 8 spectators on the scoreboard (269 §5, ONL-19), the TCM's VOTE ALL against it (264 §4.2). Left: **"[tag] name"** in the info box for a followed clan member (`FUN_00238500` D:L85563-85567, S:0x3e6718; 275 §5), the spectator's own published clan tag (`FUN_002c5450`, `CLAN_TAG_AT_SEAT_READING`; 275 §5), and research 248's F3 (the jump's alive filter) and F5 (the scenic view's live look and zoom). *2026-10-14 (SPECTATOR-VIEW): "[tag] name", F3 and F5 built (§7 items 4-6; F5's page half pending, built the same day); the spectator's own tag stays `CLAN_TAG_AT_SEAT_READING`'s.* | §5 |
| R314.7 | **How it leaves**: the START menu's ABORT (`dlgNetAbort.rdr`, SOCOM II ONLINE; built, 266 §8.10); VOTE ALL's eject -> `dlgNetBanned.rdr` (D:L159607-159610; routed by `kicked` 'vote', the screen ONL-22's); the host's both sides empty with spectators left -> `dlgNetAbandoned.rdr` (`FUN_002c4500` D:L165674-165676; built, `ABANDON_TRIGGER_READING`); **the match's end -> the same game's GAME LOBBY with the players** (GAME COMPLETE's `ExitOnStart` has no team test, P:L14601-14620; ONL-20b, 309 §7.1), where the seat stays a spectator (the swap leaves the 0x10000 word, 309 R309.6); the lobby's BACK (`exit_lobby`, #362 / #363, `ReturnToBriefingRoom`, P:L7702-7744). | §6 |
| R314.8 | **`SPECTATOR_PAD_PLACEHOLDER` is settled**: retired 2026-10-06 (PF-31, research 101 §5): +5 Up, +6 Down, +7 Triangle, +10 X (research 94's slot table), the cycle's +3 Right / +4 Left, all tested `== 3` (released). The roadmap's ONL-21 block still names it as its unknown: a stale line. *Struck there 2026-10-14 (WATCH-DOCS).* | §5.3 |
| R314.9 | **The late joiner's ghost (NU-11; the owner: "i think it did")** -- **it did**, in the dead player's mode: the ghost is drawn on no console -- the level spawns its actor and the ghost set-up puts it in the death state with its body node's opacity 0, inactive, the opacity nibble 15 sent to every console (`FUN_002b7d60` D:L158634-158638; `FUN_00543d50` D:L410437-410441, D:L410444-410445, D:L410457-410459) -- and from the level's first frame it cycles its living teammates with Right / Left as a classic dead player does (`FUN_00592560` D:L451681-451694; argument 1, D:L412604-412609; its lines `FUN_001f97b0` D:L57049-57060), until the round's reload makes it a player (`FUN_002232a0` D:L75846-75849 -> `FUN_00543b90`, opacity 1.0 D:L410380). The spectator's camera (X, Up / Down, Triangle) is not the ghost's: `FUN_00295260` acts for a spectator only (D:L139465). The port's room and bench matched (pins); its three gaps -- the front end's hold of the ghost's input, the body drawn on the others' pages, the own body drawn on its page -- the first built, the other two held for the gameplay seat. | §4.3 |

## 2. The entry

### 2.1 The screen (the BRIEFING ROOM)

The captions (ids from `locTables.json`; texts the byte read of UIMNLOC's stored strings, a leading `C2 A6` -- the
cross, `uiLoc.ts`'s `UIMNLOC_UTF8_READING` -- marked "X"):

| id | MSG_ID | text | used by |
|---|---|---|---|
| 402 | `_402_SpecMax_MSG` | SPEC/MAX | the list's header (`Category2Text`, P:L4024) |
| 406 | `_406_WatchGame_MSG` | WATCH GAME | the button (P:L4033) |
| 413 | `_413_ChooseWatch_MSG` | X Choose game to watch. | `OnGameListStart` with `WatchOrJoin` 1 (P:L4388) |
| 416 | `_416_ActivateWatch_MSG` | X Activate the games list and choose a game to watch. | `OnWatchGamestart` (P:L4345) |
| 417 | `_417_NoGames_MSG` | There are no games to watch. | no online script |
| 418 | `_418_NoGamesJoin_MSG` | There are no games to join. | `OnJoinBtnPress` for both buttons (P:L4432) |
| 419 | `_419_JoinGameSpect_MSG` | X  Join game as a spectator. | no online script |
| 252 | `_252_EnterSpectPwd_MSG` | Enter Spectator Password | the keyboard's title (research 163 §6's PLAT-17 titles) -- *2026-10-14, WATCH-JOIN: not the BRIEFING ROOM's watch keyboard's (the row below); which keyboard carries #252 is not re-read* |
| 423 | `_423_EnterPassword_MSG` | Enter a Password to Connect. | *added 2026-10-14, WATCH-JOIN:* the title both of `aux_join_game`'s keyboards carry -- `GetTextInput(PlayerGamePassword)` (P:L4584; was cited P:L4583, the `ClearUIVar` before it -- WATCH-JOIN's review) and `GetTextInput(SpectatorGamePassword)` (P:L4599) -- in the command's own bytes (`decodeTextInput`'s +0x10, research 119 §4). The `SpectatorGamePassword` keyboard's is read over the disc by `gameLobbyScreen.test.ts`'s W1 case (dev-disc test; the text through the loc reader in the same run); the `PlayerGamePassword` keyboard's rests on the review's byte scan of `RUN/UIZANIM.ZAR` (`_423_EnterPassword_MSG` three times, each beside `MPPLAYERNAME`: the three `aux_join_game` keyboards of research 119 §5; `_252_` and `_306_` once each, CREATE GAME's two, research 163 §7) -- source inspection, no test holds it |
| 424 | `_424_CannotSpect_MSG` | You cannot be a spectator in that game. Please try a different game. | `aux_join_game` (P:L4621) |
| 352 | `_352_GameAlreadyStarted_MSG` | This game has already started. Would you like to spectate the game in progress? | `SetupLateJoiner` (P:L7259) |
| 527 | `_527_SpectRejected_MSG` | (no string stored after the name; research 264 §4.5 quotes it through the reader as "PLAYER REJECTED", the string stored after `_442_PlayerRejected_MSG` -- read as a shared string) | `spectator_rejected` (P:L4789) |

Whether #417 and #419 are the LAN BRIEFING ROOM's (not in the online dump) is not read
(`tools/dump-dialogs.ts --msg-users 417 419`). The flow: R314.1. The focus help (#416 / #411) and the list help
(#413 / #412) are the only differences the two buttons make before the join; `join_game` is one animation for both,
`WatchOrJoin` choosing `JoinAsSpectator` (P:L4552-4557).

### 2.2 `aux_join_game` for a watch (P:L4560-4714)

1. `ClanGameClosed` -> #524 (P:L4564-4570; 308 §3.1, a watch alike).
2. The rank test is a player's only (`JoinAsSpectator == 0 AND GameRejectsRank`, P:L4571).
3. The password: a watch asks `GameHasSpectatorPassword` (P:L4594), not `GameHasPassword`. `FUN_002f8d50`
   (D:L197479-197501) tests the listed record's +0x40 -- its security level -- **& 4** (D:L197495); `GameHasPassword`
   (`FUN_002f8dd0`) & 1 (D:L197521). A yes opens the keyboard on `SpectatorGamePassword` (P:L4599), CANCEL stopping the
   join (P:L4600-4605).
4. `JoinMPGame` (`FUN_002f83b0`): for a spectator (`FUN_002f6d00` D:L196203-196215: `JoinAsSpectator` S:0x3f5730, or
   `DAT_004413d8`) and a record whose +0x19e is 0 it **returns 1 at D:L197175-197178, before the valves are written**
   (`MaxSpectatorsValve` from the same +0x19e at D:L197206-197218); the held game was set to -1 just before
   (D:L197167-197168). Else the valves, state 15, 1 (165 R165.2).
5. State 15 (`FUN_002eda60`) sends JoinGame: the world id, join type 1, `SpectatorGamePassword` (D:L190376-190395;
   `lobby.ts` `JOIN_TYPE`). The services check the password (`SPECTATOR_PASSWORD_READING`: the spectators' when set, else
   the game's) and seat the member as a spectator.
6. The game socket: the host's join request carries mask 1 (`FUN_0030d380` D:L209966-209968, from the same
   `FUN_002f6d00`); online it carries no password hash -- the hash (`PlayerGamePassword` S:0x3f6720 & 0x7f0000fe) is
   sent only when `ComeFromLan` (S:0x3f6328, `FUN_003045b0` D:L204495-204507) is set (D:L209950-209964).

**The port.** Steps 1-6 run (the page runs the disc's script; `GameLobbyCommands.JoinMPGame` transcribes step 4's
order, `joinGame` sends join type 1 and the spectator password; the bridge seats a member whose join type is 1 as a
watcher, `bridge.ts` `seatFor(..., member.joinType === JOIN_TYPE.Spectator, ...)`, so the game socket's hello needs no
`watch` of its own). Held by `gameLobbyScreen.test.ts`'s SVC-23f case (a WATCH GAME join sends join type 1). **The gap
is the security level**: `lobby.ts` makes it `PlayerPassword` for a non-empty game password and `None` otherwise (the
game's create, `createGame`), never `SECURITY_LEVEL.SpectatorPassword` (4), so `GameHasSpectatorPassword`
answers 0 for every listed game: the keyboard is never opened, `SpectatorGamePassword` goes empty, and the services --
which do check `game.spectatorPassword` -- answer -978. The client reads the bit, so the services that served it set it
for a game created with a spectator password (`SPECTATOR_PASSWORD_SECURITY_BIT_READING`; the services' own writer is
not on the client's side of the wire). The code's doc of `JoinMPGame` cites the early return at D:L197166-197168: the
lines are D:L197175-197178. *2026-10-14, WATCH-JOIN W1: the gap closed -- `createGame` sets `SpectatorPassword` (4) for a
non-empty spectator password beside `PlayerPassword` (1), and a world report leaves it (`SPECTATOR_PASSWORD_SECURITY_BIT_READING`,
server `lobby.test.ts`); the page's half was already built (`gameLobbyScreen.test.ts`'s W1 case: WATCH GAME on a listed
game of security 4 opens the keyboard on SpectatorGamePassword, the right password seats, a wrong one "Password
incorrect.", JOIN GAME asks none). The modern members route's "locked" (a product view) stays the game password's bit
0. The `JoinMPGame` doc cite is W7's, not corrected here.* *Corrected 2026-10-14 (WATCH-DOCS, W7): the doc cites
D:L197175-197178, re-read at the source.*

**A private game whose creator left the spectator password empty**: the client asks no password for a watch (step 3
reads only bit 4) and sends an empty one; the services check it against the game's password
(`SPECTATOR_PASSWORD_READING`, research 154 §6), so such a watch is refused "Password incorrect." unasked. That is the
reading's consequence, not a new gap; ONL-32's transcript of WATCH GAME on a private game (154's own settle) decides it.

### 2.3 SPEC/MAX

R314.3. CREATE GAME's SPECTATORS row toggles `MaxSpectatorsValve` 0 / 8 online and asks the spectator password when
turned on (research 203; 163 §2: `FUN_002edda0` sends the spectator password only with the valve not 0, else "",
D:L190545-190547); the world report sends MaxPlayers as `MaxPlayersValve` + `MaxSpectatorsValve` and GameStats byte 4
the valve (264 §4.5, `FUN_002ef590` D:L191354-191363; `FUN_002f7c40` D:L196730-196731). The create sends the same sum (`FUN_002edda0`
D:L190528-190550) and its reply writes no valve (`FUN_002ee090` D:L190586-190641), so the creator's report is its
create's total; the port's create path copied that total into `MaxPlayersValve` and reported the slots twice until
LATER 232 (2026-10-21; reading, re-read at the source by its fresh review and a second reviewer). Both valves are global
(`MaxSpectatorsValve`, `JoinAsSpectator`, `SpectatorPasswordValve` and `mp_spectator` sit in `READERC.ZAR`'s names
table beside `ClanSwapSidesIndex`, byte offsets 286304-287076; research 309 §2.3's table; the golden
`viewer/test/golden/global-valves.json` lists the first three), so `MaxSpectatorsValve` holds the last value written --
by a create, CREATE GAME's opening (`init_cg_screen`, §3.1), a join's copy, or VOTE ALL's eject (264 §4.2) -- until the
next.

## 3. The refusals

### 3.1 The client's own (before any request)

- **#524** (308 §3.1): a members-only clan game of another clan, for a watch as for a join (`CLAN_CLOSED_WATCH_READING`:
  the host would admit the watch).
- **#424**: `JoinMPGame` answered 1 with nothing queued (§2.2 step 4) and `MaxSpectatorsValve == 0 AND JoinAsSpectator
  == 1` (P:L4619): the popup 3 s, `abort_join` (P:L4620-4627), the BRIEFING ROOM again. The valve is the one the last
  write left (§2.3): 0 on a fresh boot (the golden's 0), after a create with SPECTATORS off, or after an eject. **After
  any join of a game with spectator slots it is not 0**, nor after merely opening CREATE GAME online: `init_cg_screen`
  (CREATE GAME's ONSTART, P:L5097) takes its default branch when `CreateGameSettingsChanged` is 0 (P:L5797, the ELSE at
  P:L5812) and writes `MaxSpectatorsValve` 4 with `ComeFromLan`, else 8 (P:L5821-5825) -- and `aux_join_game` writes
  `CreateGameSettingsChanged` 0 at every join (P:L4617), so opening CREATE GAME after any join writes 8, and leaving it by
  TRIANGLE keeps 8 (`create_game_exit`, P:L5099, P:L6325-6335: it sets `CreateGameSettingsChanged` 1 and saves the
  valves, `MaxSpectatorsValve_saved` among them, for the next open's restore, P:L5798-5811). So #424 is the
  rarer answer and the quiet timeout the common one. In the other branch the script: it waits for state 17,
  calling `JoinMPGame` again each second while the state is 11 (P:L4629-4632) -- which answers 1 again, queuing nothing
  -- until `monitor_timeout` writes #440 "Timeout Failure" at 30 s and aborts (P:L4708-4714). The port transcribes the
  same order (`JoinMPGame`'s early return before `enterGameLobby`), so it does the same; a test pins neither branch
  (`WATCH_NO_SLOT_STALE_VALVE_READING`). *Pinned 2026-10-14 (WATCH-DOCS, W7; reading, pending review):
  `packages/ui/test/screens/watchNoSlotValve.test.ts` over the disc's scripts -- with the valve 0, #424 for 3 s and
  `abort_join`, no JoinGame, no socket; with it 8 from an earlier join of an 8-slot game, or from CREATE GAME opened and
  left by TRIANGLE, no JoinGame, `JoinMPGame` asked again each second, #440 on JoiningAnim at 30 s, the BRIEFING ROOM.
  Green at once: a pin, no code changed.*

### 3.2 The services' and the host's

- **JoinGame** (the services): the password (-978), a ban (-972), any other failure #441 (165 R165.3). The original's
  services know the game's MaxPlayers as the two valves' sum (§2.3); whether they tell a watcher from a player against
  the split is not on the client's side of the wire.
- **The host** (`FUN_002bc620`, the join request's handler, D:L161149-161492), for a request with mask 1 (`bVar1` false,
  D:L161235): the clan block is skipped (D:L161256-161258, 308 §3.2); on a LAN only, a password hash that differs is
  refused with reason 1 (D:L161254, D:L161303-161325); then the spectators' branch (D:L161395-161427): the limit is
  `MaxSpectatorsValve` (S:0x3f2680, the same name as S:0x3f58d0; 8 when the valve is absent, D:L161396-161400) against
  the spectator count `DAT_00441458` (recounted from the slot records' 0x10000 words, `FUN_002c4500`
  D:L165649-165654); at or past it the reply's side 4, reason 2 (D:L161414-161415); else side 3 (a spectator), no slot
  team (D:L161425-161426), and the Game Signal tells it with the swap flag (D:L161450-161458). The joiner shows reason 2
  as "Too many spectators" (S:0x3f24b0; `FUN_002b9150` D:L159206-159227) through MP_EJECT_SPECTATOR (S:0x3f2530) and the
  dialog's `spectator_rejected`: the BRIEFING ROOM's (`halt_join`, `DisconnectFromGameServer`, #527, the popup of the
  text with #226, `SWITCHMENU(dlgMPBriefingRoom.rdr)`, P:L4786-4795) or the GAME LOBBY's if it holds the join (the
  popup with #364, `ReturnToBriefingRoom`, P:L7749-7763).
- **No other**: the host reads no `mp_locked_game` at a join (309 §4.1); a watch of a launched game is admitted (the
  late joiner, §4.2).

**The port.** "Too many spectators" exists for one case only -- after VOTE ALL's eject, the room's
`spectatorsShut` (`room.ts` `TOO_MANY_SPECTATORS`; the page's `seatEnded` posts MP_EJECT_SPECTATOR, built and tested by
SVC-23f). A watcher past the slots is refused **at JoinGame** (`lobby.ts` `joinGame`: spectators >= GameStats byte 4 ->
`WorldIsFull`, research 154 §6's departure), so the page shows #441 "Game Full or Locked" on JoiningAnim instead of the
host's popup; and the room's roster, past `maxSpectators` (`net/lobby.ts`, queue and watchers together), refuses the
hello with "The game is full." (`room.ts` `hello`). The original's split is the host's: the services bound the sum, the
host the spectators (`WATCH_SLOTS_HOST_REFUSAL_READING`). *2026-10-14, WATCH-JOIN W2: built as read -- `lobby.ts`
`joinGame` bounds a watcher by MaxPlayers only (its spectator-slot test removed, research 154 §6's departure retired),
and the room refuses a watching hello the roster cannot hold (past `maxSpectators`, the queue and the watchers together,
`net/lobby.ts`) with `TOO_MANY_SPECTATORS`, a playing one past the players and the queue still "The game is full."
(server `lobby.test.ts`, `room.test.ts`; over real sockets `bridge.test.ts`: a third watcher of a 2-slot game admitted
at JoinGame, its hello refused "Too many spectators", its BACK freeing its seat at the services). The page's half is
SVC-23f's (`seatEnded` -> MP_EJECT_SPECTATOR, #527, the BRIEFING ROOM), one text for both refusals. The room's change
reaches the map viewer's watch too (`online.ts`, a browser instrument): its watcher past the room's spectators now
reads "Too many spectators".*

**The port refuses a watcher by rank; the original does not.** The original checks rank on the client and for a player
only (`IF JoinAsSpectator == 0 AND GameRejectsRank`, P:L4571; §2.2 step 2), and neither Medius server judges a rank
(research 261's `RANK_GATE_ON_SERVER_ADAPTATION` row). The port's `lobby.ts` `joinGame` refuses every non-host whose
tier the game's GameStats byte 7 does not admit (`rankAdmitsGame`, `RANK_REFUSED_STATUS_PLACEHOLDER`, Fail), watchers
included -- its doc says "for a player and a watcher alike, as `aux_join_game` asks it before either", and research
261 §10.4 says the same ("A watcher is judged as a player is"): both misread P:L4571. So a watcher of another tier's
game gets #441 "Game Full or Locked" on JoiningAnim where the original admits him. The adaptation of *where* the gate
runs stands; its scope is the original's -- join type 0 only (W8). This note corrects research 261 §10.4 there; 261
itself is re-filed by W8's docs. *2026-10-14, WATCH-JOIN W8: built -- `joinGame` judges the rank for join type 0 only
(server `lobby.test.ts`; `rankGate.test.ts`'s watcher case corrected, it held the misread); the `joinGame` doc and
`RANK_GATE_ON_SERVER_ADAPTATION`'s (whom it judges, the original's) say so; research 261 §10.4 and its §6 row re-filed.
The page's join path carries no tier (`GameRejectsRank` answers 0, `PLAYER_TIER_PARKED_READING`), so no page case.*

## 4. What the watcher joins

### 4.1 A game in its lobby

- **The seat**: the host places a watch on the spectators' side (side 3, §3.2); the GAME LOBBY's `player_team` is 16
  and the SPECTATORS column (`Category1Text` #340, P:L6571; `RefreshGamePlayerList`'s [name] list, 165 §2) lists it.
- **The script for `player_team` 16**: `Enable_SM_Launch` disables SWITCH TEAMS (`Glswitchteams`) and the ARMORY
  (`weaponselect`) (P:L7133-7136); `ArmButtonClock` disables the ARMORY and skips its 10 s count for team 16
  (P:L7000-7001), so it never sets `ComeFromBriefing` 1 (P:L7044) for a watcher. Then, for a seat neither session master
  nor late joiner, `Enable_SM_Launch` calls `SetupNormalJoiner` (P:L7217-7222), which **re-enables SWITCH TEAMS whenever
  `IsSwitchTeamsOK` answers yes** (P:L7279-7281), with no team test: `IsSwitchTeamsOK` (`FUN_00277420` ->
  `FUN_002f8ce0` D:L197467-197474) answers 0 only for a game whose clan option (`FUN_002e99e0`, `DAT_0044f780`) is 1, 2
  or 4, so a watcher of an ordinary game sees SWITCH TEAMS lit (research 165:177: "enabled by `IsSwitchTeamsOK` alone,
  for host and joiner"). Its press does nothing: the host's move (`FUN_002c4290`) swaps a seat only whose word is one of
  the two sides' (D:L165538, D:L165555), and a watcher's is 0x10000. `CycleReadyButton` disables both at minor state 2
  (P:L7391-7397) and, at minor state 1, re-enables them for any team but 16 (P:L7405-7420), so once the minor state has
  passed through 2 and back to 1 a watcher's SWITCH TEAMS stays off (whether that cycle runs at a lobby's entry is not
  read here). The ARMORY
  stays off throughout; a **late** watcher's SWITCH TEAMS is off (`SetupLateJoiner`, P:L7246).
- **READY**: `SetupNormalJoiner`, with `ComeFromBriefing` 0 -- the BRIEFING ROOM's start writes it 0 (P:L4294), and for
  a watcher nothing writes it 1 (its only other writes are `ArmButtonClock`'s end, P:L7044, and the ARMORY's entry,
  P:L7654) -- disables READY and runs `ClientDAReadyButton` (P:L7283-7285): a 10 s count on `TenCountPR`, then
  `team_monitor` and READY enabled (P:L7831-7856). So READY is not live at once; after the count its press toggles the
  console's own record (165 R165.6), which the host's ready count does not take (`FUN_002c40c0`,
  `READY_SEATS_READING`). Research 165:177 reads the `ComeFromBriefing == 0` branch as "a lobby a match returned to";
  the valve's writes say it is the fresh join's (and, for a player, a return only before his first weapon count ended):
  noted here, 165 not edited.
- **The port**: the view's watcher (`team: null`) gives `player_team` 16 (`sideTeam`); the page's `IsSwitchTeamsOK`
  answers 1 (`gameLobbyCommands.ts`, no clan game here), so the disc's script lights SWITCH TEAMS for a watcher as the
  original does and disables the ARMORY; the room refuses a watcher's READY and SWITCH TEAMS ('spectator',
  `gameLobby.ts` `ready` / `switchTeams`) -- for SWITCH TEAMS the same outcome as the host's no-op, a match; for READY, so
  the page's own READY toggle is undone at the next view (`WATCHER_READY_PRESS_READING`: what the original shows of a
  spectator's READY to himself and to the others is not read).
- **The launch**: the watcher goes to the load with every console (`check_loop`); the host's load barrier waits for the
  launched players (the room's `loaded` barrier counts non-spectators, `room.ts`).

### 4.2 A game already launched

- `late_joiner` is 1 for a seat whose first game state is past the lobby (179 §6.11), so `Enable_SM_Launch` runs
  `SetupLateJoiner` (P:L7243-): #351, SWITCH TEAMS off, READY on, and with `ComeFromBriefing` 0 the #352 popup for
  `player_team` 16 (#353, the ghost's, otherwise), YES / NO (P:L7257-7262). NO: `exit_lobby` with no prompt
  (P:L7272-7276). YES: the list refreshed every 5 s while `late_joiner` is 1 (P:L7268-7271).
- **What ends the wait**: the late flag (game +0xcc, the valve `late_joiner` through `FUN_002a7340` D:L149273-149280) is
  cleared in the level's frame once loaded (`FUN_001f5e70` D:L55711, D:L55715-55716), and in the same branch the ghost
  flag +0xd2 is set only when the local seat is no spectator (D:L55725-55727; research 225's `VOICE_GHOST_FLAG_READING`
  row). So the late joiner -- the watcher included -- loads into the round in progress; #352's own words ("spectate the
  game in progress") and #353's ("appear as a ghost in the current game") say the same. What takes the console from the
  lobby to the load for a late joiner (`check_loop`'s wait over the major state) is not re-read here. *Read 2026-10-14
  (LATE-WATCH; reading, pending review) -- **READY, not YES**:*
  - *YES (`AreYouSure` 1) only waits: the list redrawn every 5 s while `late_joiner` is 1 (P:L7268-7271); nothing on
    that path writes the major state. `SetupLateJoiner` lights READY at once (`ActivateButton` / `EnableButton(PlayerReady)`,
    P:L7250-7251).*
  - *READY's CROSS runs `ready_anim` (P:L6644), which calls `ReadyToLoad` (P:L7433): `FUN_0027caf0` (D:L125595-125611),
    past its 5 s repeat, tests the late flag +0xcc and, set, calls `FUN_002a7420(game, 2)` and `FUN_002a73b0(game, 1)`
    (D:L125606-125608) instead of `FUN_002c3fc0` -- the decompiler shows the first call with no argument; the ELF's
    instructions give it 2 (`addiu a1, zero, 2` in the branch's delay slot at 0x0027cb24, run on both paths). +0x114 is
    `mp_major_game_state` and +0x115 `mp_minor_game_state` (the game record's init stores the two valves' records at
    +0x20 and +0x24, D:L149542-149554; `FUN_002a7420` and `FUN_002a73b0` write the byte and its valve, D:L149296-149342),
    so the major state goes to 2 and the minor to 1, and nothing is sent. `check_loop`'s `WHILE mp_major_game_state != 2`
    then ends (P:L7116) on `SWITCHMENU(LOAD_SCREEN)` (P:L7126).*
  - *No team test in `FUN_0027caf0`: the watcher (#352) and the late player (#353) load alike, into the round in
    progress; the level then clears the late flag and sets the ghost flag for a non-spectator only (above). So the late
    player too loads on READY, as the ghost of the round in play, and plays from the next round -- the port's
    `LATE_JOINER_NEXT_ROUND_READING` (the lobby held until the room's next `roundStart`) was a second departure.*
  - *What else moves the console: `FUN_002c3cf0` (D:L165355-165410), run by `FUN_002c5360` (D:L166197) when the host's
    told game state +0x113 changes (`FUN_002c0850` D:L163336-163342), takes a console at major 1 to 2 on the host's state
    2 when it is ready, a spectator (`FUN_002f6d00`) or +0xd8 is set, and on state 3 when it is ready; on 6 it writes 6
    (unless at 1); on any other non-zero state it writes the host's state and the minor 1 (the arguments from the
    instructions at 0x002c3e10-0x002c3fa0). Which states the host passes through mid-round is not read, so whether a
    late seat that never presses READY is carried to a load (the host's next state 2) is open
    (`LATE_SEAT_NEVER_READY_PLACEHOLDER`, §8).*
- **The port**: `LATE_JOINER_NEXT_ROUND_READING` holds every late joiner until the room's next `roundStart`
  (`gameLobbyCommands.ts` `roundStart`), so a watcher answering YES sits in the lobby until the round ends. The room
  itself already takes a watcher mid-round (the map viewer's watch, `online.ts`, joins a running match), so the page's
  hand-off is the gap (`LATE_WATCHER_IN_PROGRESS_READING`). The ghost's own timing is the general late joiner's (179
  §6.11), not ONL-21's. *Built 2026-10-14 (LATE-WATCH, W19.R12; reading, pending review): `GameLobbyCommands.ReadyToLoad`
  takes the late branch while `late_joiner` is 1 -- the minor state 1, no `lobbyReady`, the major state 2 and the hand-off
  with the lobby's welcome and no `roundStart` (`READY_LOADS_LATE_JOINER_READING`), so `check_loop` switches to
  `LOAD_SCREEN`; YES only waits, and the room's `roundStart` in the lobby hands nothing off. The page's load lets the late
  seat through on that welcome (a round under way, or a ghost seat: viewer `lobbyMatch.ts`, `CLIENT_ROUND_WAIT_READING`);
  a watcher let through so is live at once (`LobbyMatch.blocked` false from the match's first frame), the ghost still held
  until the next `roundStart` (research 166 §7 (b), unchanged). The late player is seated as the room's ghost
  (`welcome.ghost`; no room change). `LATE_JOINER_NEXT_ROUND_READING` is reworded (research 165 §6). Tests: ui
  `gameLobbyScreen.test.ts` (dev-disc: #352 and #353, YES waits, NO leaves, READY -> `LOAD_SCREEN` with no `roundStart`),
  viewer `frontEndMatch.test.ts` and `lobbyMatch.test.ts` (unit).* *The review's F1 (2026-10-14, pending review): the
  hand-off on READY stands apart from any round's start, so its clock is the host's timer as it stands -- the room's last
  `score` heard in the lobby (sent at the seat's hello and at each change), its `timeLeft` run on by the lobby's wait and
  by the load's (viewer `gameLobbyHost.ts` `GameLobbyHandOff.score`, `LobbyMatch`), replayed after the hand-off's round
  start; a `roundStart` of a round the room has said over (`roundOver`'s `round`) is not handed on, and a score older than
  the round handed on gives way to that round's total less its time run (viewer `gameLobbyHost.test.ts`,
  `lobbyMatch.test.ts`, `frontEndMatch.test.ts`). Left: a late seat handed off while the round it heard start in the lobby
  still runs gets that round's banner (a player) and intro cue at the mount -- the port's room seated it at that round's
  start, where the original's late console loads as the ghost of the round in play (`FUN_001f5e70` D:L55725-55727); the
  room and `netPage.ts` are not this task's.* *The re-review's N1 (2026-10-14, beside ROUND-90, pending review): the lobby's
  socket also keeps the last `roundOver` after the welcome and hands it on, with how long ago it came, when it came after
  the round handed on (or with none); the controller's round screens (ROUND-90's 90 s) and the game's end are taken from
  it, opened `ROUND_SCREENS_AFTER_S` after its arrival, and the welcome's standing result only when nothing later was
  heard (viewer `lobbyMatch.test.ts`: a hello in round 1's screens, round 2 started and over in the lobby, READY in round
  2's screens). The page's drawn screens on such a mount still come from the welcome's replay (`netPage.ts`, not this
  task's).*

### 4.3 The late joiner's ghost (NU-11, 2026-10-15)

Status: **reading, pending review** (the decompilation re-read at every line cited, by its author; nothing measured
running; ONL-32's capture of a late JOIN GAME -- both consoles -- is the proven level). The owner (NU.R4, verbatim):
"Spawning in as a ghost appears to cause the following issue: Player that joined in has a visible model and can't
spectate. I am unsure if the original allowed you to join and view players on your team in the same spectate mode one
normally sees dead (i think it did)."

**The answer: it did.** A late joiner seated as a ghost watches its living teammates in the mode a classic dead player
has, from the level's first frame until the next round, and nobody -- itself included -- sees its body. One precision:
that mode is the dead player's teammate cycle (Right / Left among the living of its side), not the WATCH GAME
spectator's free and scenic cameras.

1. **The ghost is drawn on no console.** The level's spawn of the local actor, `FUN_002b7d60` (D:L158609-158650; called
   once, behind the flag `DAT_0044ce50`, D:L158523-158525), places it by `FUN_002b8100` (D:L158619-158624) and posts its
   0x1f (D:L158629-158631); then, for a seat that is no spectator and whose ghost flag `+0xd2` is set (D:L158633-158636)
   -- as for every spectator (D:L158646-158647) -- it calls `FUN_00543d50` (D:L158638, D:L158641). That function puts
   the actor into state 8, the death state (D:L410437; research 276 §7), sets its body node's opacity `+0x9c` to 0
   (D:L410440) and makes the node inactive (D:L410441: slot 0x38 of the node's `+0x60` table, research 199's
   `SetActive(false)` beside `m_Opacity` `+0x9c`), packs the opacity nibble 15 -- "hidden", research 199 -- and bit
   0x40 into the actor's published word and sends it (D:L410444-410445, D:L410457-410459), and posts event 0x22
   (D:L410460-410462; research 225's ask of 3). So the ghost's actor exists on every console, dead, unseen and out of the
   hit tests. In a respawn game the flag is cleared at once (D:L158640-158642): the late joiner is a dead player until its
   first respawn, no ghost. The round's reload ends it: `FUN_002232a0` clears the flag and calls `FUN_00543b90` on the
   local actor (D:L75846-75849), whose opacity 1.0 and `SetActive(true)` (D:L410380-410381) draw it again (research 282
   §7).
2. **It watches as a classic dead player does: its living teammates.** The cycle latch `FUN_00592560` takes Right /
   Left (pad +3 / +4, released) into the actor's `+0xfcd` / `+0xfce` when respawn is off, or the ghost flag is set, or
   the seat is a spectator (D:L451681-451694); for a non-spectator the cycle walks the living of its side, the escortee
   bit refused (argument 1, D:L412604-412609; research 248 §2, 232 §5). The death state's entry takes the same "respawn
   off, or a ghost" branch (`FUN_005979a0` D:L454484-454487). The HUD says so on the ghost's own object -- "You are a
   ghost.  You will play the next" / "round as a real player.  %c Select new" and, respawn off, "weapons. Use the £ and
   ¯ directional" / "buttons to cycle through living teammates." (`FUN_001f97b0` D:L57049, D:L57056, D:L57059-57060) --
   and on a teammate (`FUN_001f9f20` D:L57162-57165; research 282 §7). The spectator's camera (X between follow or
   scenic and free, Up / Down the scenic views, Triangle the jump) is not the ghost's: `FUN_00295260` acts for a local
   spectator only (D:L139465; research 248 §2), and the ghost is a player.
3. **Where its view starts.** With respawn off, `FUN_002b8100` places a non-spectator at a spawn slot of its side by its
   seat (`+0xfc8`, D:L158758-158763), so the ghost's unseen actor stands at its side's slot, the view on it until the
   first cycle (research 282 §7 left the start open; this narrows it to the own object at its slot). The port's ghost page
   stands its walker at the match's opening stand (`matchMount.ts` `standOf`), not a slot: `GHOST_OWN_PLACE_READING`
   (§8, note only), not built.
4. **A ghost promoted from the spectators' queue takes the same view (LATER 90, 2026-10-17; reading, pending review;
   source inspection by the author, nothing measured running).** The original has no queue and so no promotion: a
   game seats 2 to 16 and refuses the next joiner (research 179 §6.17, `QUEUE_TEXT_PLACEHOLDER`), and a watcher stays a
   watcher. The port's promotion seats a ghost as it seats a late joiner's (`promoted`'s `ghost`, the welcome's lines),
   so the nearest original state is item 1-3's: a console's camera is bound to its own local actor -- at the level's
   start (`FUN_001ea720` D:L49731-49732, the camera's slot +0xc on the local actor) and at the local actor's set-up
   (`FUN_00599b60` D:L455685-455701: for a non-spectator online the camera reset `FUN_00299150` D:L455694, for a
   spectator `FUN_00543d50` D:L455698, then the bind on the own actor either way, D:L455701); the slot's bind
   (`FUN_0029b3c0` D:L142748-142785, through `FUN_002956e0` D:L142768) takes the actor it is given. The ghost's actor
   is in state 8 (item 1), so the bound camera runs the death camera (`FUN_00297410` D:L140893-140913: the bound actor
   +0xbc in state 8 sets mode +0x144 1, unless a local spectator in mode 6). The spectator's free and scenic camera
   acts for a local spectator only (`FUN_00295260` D:L139463-139466), and the ghost is a player. So the promoted
   ghost's own view is its dead body through the death camera, as a seated ghost's -- never the free camera. *Built
   (reading; re-read at the source by its review, 2026-10-17)*: the page's promoted path, after `seatGhost` has made the walk dead (its death camera
   with it), gives the walk back where the walker stands (`netPage.ts` -> `WalkMode.resumeBody`, DEAD-CYCLE's), so
   the spectator welcome's `setMode('fly')` no longer leaves the ghost the free camera the keys move until its first
   cycle (viewer `nu11GhostWalk.test.ts`, LATER 90: the walk, its feet unchanged, the camera the walk's eye about the
   own body). Where the walker stands is where it last stood: the mount's opening stand, as for a welcomed ghost, or,
   for a seat demoted for idling and later promoted as a ghost, the place it last stood (the `'demoted'` event's
   switch to fly keeps the walker); neither is the original's slot (`GHOST_OWN_PLACE_READING`, item 3). (Was: "Where
   the walker stands is the mount's opening stand, as for a welcomed ghost"; LATER 90's review F1.)

**What the port already matched (NU.R3, pinned):** the room's half -- a seat made in a classic round in play is not
alive, never spawned or killed in that round, its body on the others' wire dead with no death, the join envelope's
ghost, spawned at the next round (server `roomGhost.test.ts`, a pin green at once; `room.test.ts`'s late-joiner case,
`roomJoin.test.ts`'s envelope); and the page's bench -- `seatGhost` benches the ghost (`netPage.ts`), the cycle runs for
it (`deadCycleRuns`, `DEAD_CYCLE_RESPAWN_READING`), its living teammates only, none of the spectator's camera, the HUD
`own` / `teammate` (PAR-48b) (viewer `spectatorView.test.ts`'s NU-11 pin, green at once).

**The three gaps, in the owner's words:**
- **"can't spectate"**: the front end's late hand-off held the ghost's input until the room's next `roundStart`
  (`LobbyMatch.blocked`, LATE-WATCH; research 166 §7 (b): "a ghost has no body before the next round" -- which this read
  corrects: its actor exists, dead, from the level's first frame), so neither the pad nor the keys reached the bench.
  *Built (reading, pending review)*: `lobbyMatch.ts` -- a late hand-off whose welcome seats a ghost is live from the
  match's first frame, as a late watcher's is (viewer `lobbyMatch.test.ts`, `frontEndMatch.test.ts`: the ghost's
  expectation was `held: true`). The test room (`main.ts`) never held it past its load.
- **"a visible model", on the others' pages**: only a welcome's envelope marks ghosts (`markGhost`, PF-28,
  `GHOST_BODY_READING`); a page already in the round sees the new seat's body arrive dead with no death and, with no
  death clip and the classic corpse rule (`Infinity`, NU-4), draws it standing. *Held for the gameplay seat* (hunk H1,
  `remotePlayers.ts`): a body first seen dead whose death the page never heard is a ghost; its test written and red
  (viewer `nu11GhostRemote.test.ts`, held with the hunk outside the tree -- not committed, since it calls the
  unapplied behaviour; NU-11b rewrites it against NU-12's text, the review's F2), green on a scratch copy of the file with the hunk applied; `remoteDeath.test.ts`'s
  `clear()` case changes with it (a death in the new room first). The wire alternative -- the room's `joined` carrying
  the ghost seat, the page marking it -- is a protocol field (`room.ts`, `protocol.ts`, `netPage.ts`).
- **"a visible model", on its own page**: the match's mount stands the walker in walk mode at the opening stand for
  every seat, and nothing hides a ghost's own body. *Held for the gameplay seat* (hunk H2, `play.ts`, and the one call
  in each of `main.ts` and `matchMount.ts`): `Play.frame` told the seat is a ghost (`NetPage.prompt()`'s `ghost`) draws
  no own body; its test written and red (viewer `nu11GhostOwnBody.test.ts`, held outside the tree likewise; NU-11b rewrites it, the review's F2), green on a scratch copy of `play.ts` with it applied. *Built 2026-10-16 (NU-11b; reading, pending review): H1 -- a body first seen dead with no
  death heard since its seat's spawn is a ghost (`remotePlayers.ts` `deathsHeard`: a kill and a welcome's corpse count
  as heard; dropped at the seat's spawn, its leaving and another room, kept across a rebuild of the copy); H2 --
  `Play.frame`'s `ghost` from `NetPage.ghost()` (not `prompt()`'s, null while the ghost watches a teammate), false for a
  classic dead player (viewer `nu11GhostRemote.test.ts`, `nu11GhostOwnBody.test.ts`).*

**Left, recorded, not built:**
- **The ghost's own walker was live from the first frame** (NU-11's review, F1; corrected at NU-11b's read,
  2026-10-16): with its controls live at once, a late ghost's walker stood in walk mode at the opening stand, locked by
  its client until a spawn (`net/client.ts` at the open and at `rebind`: no stick, no jump, no stance, no lean -- the
  review's "can run, jump" was not so), but with the look, the fire, the reload, the throw, the inventory and the
  actions live -- each reads `WalkMode.isDead` alone -- with their local flash and sound until its first teammate cycle
  switched it to fly mode (`netPage.ts` `seatGhost` only benched). The original puts the ghost's actor in the death
  state at its spawn (`FUN_00543d50` D:L410437), so it can neither walk nor fire. Nothing reached the room (`room.ts`
  drops each fire and throw as not alive). *Built 2026-10-16 (NU-11b F1; reading, pending review):* `seatGhost` makes
  the walk dead, as a classic dead player's (`NetClient`'s `kill` -> `WalkMode.setDead`), given back alive at its spawn
  (`NetClient.spawned`) or at the page's close or drop (`deathOff`); the walk's death camera comes with it (`FUN_00297410`
  D:L140893-140913, the player's actor in state 8), its mode 6 with no killer named (`GHOST_DEATH_CAMERA_READING`, §8).
  The teammate cycle (S6) runs as before and the death camera, the walk's, stays idle in fly mode under the follow
  view (viewer `nu11GhostWalk.test.ts`, with the throw refused and the R2 inventory closed to a ghost).
- A **respawn** room's late player handed off with no round start is held likewise (`LobbyMatch.blocked`) though the
  room spawns it at once; the original's is a dead player until its first respawn (item 1). Not a ghost, not NU-11's.
- A **kill heard by the lobby's socket** between the welcome and READY is not handed on (`gameLobbyHost.ts` keeps the
  welcome, the last `roundStart`, `score` and `roundOver`): that corpse is drawn standing at the mount today, and as
  nothing under H1; the original draws a corpse. The hand-off's, not this row's.
- Research 166 §7 (b) (corrected above) and research 282 §7 (the camera's start, narrowed above) are not edited here.

## 5. In the match

### 5.1 Built (from earlier rows)

The spectator camera and pad (research 248 F1 corrected by PT-19b; 232 §5; `spectatorView.ts`): free at entry
(`SPECTATOR_START_READING`; the pose `SPECTATOR_ENTRY_POSE_PLACEHOLDER`), X between follow or scenic and free, Up / Down
the scenic views, Triangle the jump, Right / Left the cycle through every living non-spectator (hostages
`SPECTATOR_HOSTAGE_READING`). The HUD (research 282): the hide-all, the info box, `CSpectatorInfo`, the six help lines
of 91 §12, SELECT hiding the panel. The START menu's spectator rows (RESUME, ABORT, INVERT PITCH, VIBRATION,
FIREMODE/SCOREBOARD, SPECTATOR HUD, IN-GAME TEXT MESSAGES; 266 §8). Voice: channel 10 whatever is asked, in the lobby
and the round -- the spectators hear each other only (`VOICE_SPECTATOR_CHANNEL_READING`, 225). Text: a TEAM line's
scope 3 reaches the spectators only, an ALL line everyone (266 §3.1). The scoreboard's up to 8 spectators (269 §5).
The players' TCM shows SPECTATORS / VOTE ALL while a spectator is present (264 §4.5). A spectator takes no damage
(`ffRefuses`' 'spectator').

### 5.2 Left

- **"[tag] name"** (275 §5): the info box writes the followed actor's clan tag and name through "[%s] %s"
  (S:0x3e6718) when the tag is non-empty, the name alone otherwise (`FUN_00238500` D:L85558-85568); the page's
  `hud.ts` draws the name alone, though the rows carry the tag since CLAN-TAG-ROUND. *Built 2026-10-14 (SPECTATOR-VIEW
  W4): `taggedName` (`hud.ts`), the tag off the followed body's score row (`clan`), the cut measuring the tagged string
  (D:L85571); the dead player's teammate view too (the same function's viewed actor).*
- **The spectator's own clan tag** (research 275 §5): the published player state's builder `FUN_002c5450`
  (D:L166218-166312) has no role test, so a clan member watching likely publishes his tag (his speaker line "[tag]
  name"); the port's rows are the players' and give a spectator none (`CLAN_TAG_AT_SEAT_READING`, research 275).
  *Read 2026-10-15 (SPECTATOR-CLAN-TAG; reading, pending review; research 275 §5): the tag is written for a watcher as
  for a player -- the builder's one role test picks the team word only (D:L166237-166264), and WATCH GAME's
  `JoinGameServer` (`FUN_0027e380` D:L126414-126422) makes the state. It shows on the speaker line, round and lobby
  (`FUN_00238ac0` D:L85680-85690, `FUN_0027cbf0` D:L125668-125677), on the other spectators' screens only (channel
  10), and in his own info box in free and scenic (`FUN_00238500` D:L85558-85568; the page's
  `SPECTATOR_OWN_INFO_PLACEHOLDER`); no board, list, MVP or name tag draws a spectator's tag. A gap: the room keeps a
  watcher's tag but the score's `spectators` carry names only; the follow-up row's design and files are 275 §5's.*
- **Research 248's F3**: the jump (`FUN_00294f40` D:L139348-139446) has no alive test and walks the actor list in its
  order; `spectatorView.ts` filters the living and sorts by seat id (`JUMP_TO_VISIBLE_READING`'s doc: "only the living",
  a choice). The order's equivalence to seat ids is `SPECTATOR_CYCLE_ORDER_READING`'s. *Built 2026-10-14
  (SPECTATOR-VIEW W5): no alive filter, the seat ids' order kept as the list's stand-in; the doc re-filed. The follow
  camera's port rule still moves off a followed body that is dead (`follow`, research 248 §5's open death fallback), so a
  dead body the jump takes is followed for that frame only.*
- **Research 248's F5**: a scenic view is an authored start with live look and zoom -- the magnification
  `clamp(m + dt x input x m x 1.3, 1, 30)` (D:L140408, D:L140512-140529), reset to 1 entering or leaving scenic; the
  page stands the authored pose frozen (`standScenic`). *Built 2026-10-14 (SPECTATOR-VIEW W6), the module's half:
  `SCENIC_ZOOM`, `SCENIC_LOOK`, `scenicMagnification`, `scenicLook`, `SpectatorView.magnification` and the host's
  `magnify`; the resets read at X (D:L139485-139498), Up / Down (D:L139536-139550, D:L139564-139578) and a bind out of
  scenic -- the jump and the cycle (`FUN_002956e0` D:L139687-139697), each only when more than 0.01 from 1; the sticks'
  mapping `SCENIC_LOOK_AXES_READING` (§8). The projection is the magnification (D:L140524-140527, as `FUN_0029b2f0`).*
- Not ONL-21's: F2 (the dead's cycle and the own body), F4 (the follow camera's setup, unread), F6 (the free camera's
  speed, an adaptation): research 248 §6.

### 5.4 The followed player's death, departure and deletion (AD-8, 2026-10-16)

Web sprint 40's AD-8 (the reconciliation's claim C83; chunks 07 and 14 of
`plans/inventory/2026-10-15/reconciliation/`). Each function and line the chunks cite re-read at the source by AD-8's
implementer (source inspection; no test, no run). The chunks' three distinctions are at **reading** (W40.R4: chunk 14's
independent review names C83); what this re-read adds beyond them -- items 1.3-1.5, the deletion's timing and
registration (3.2, 3.3) -- is **reading, pending review**. Nothing here is measured on the original running: the
original's first-visible-frame target and timing is ONL-32's death / retire / delete event trace (W40.R5).

**1. Death: the bound actor kept.**
1. The frame `FUN_002998f0` (D:L141956-142034) dispatches on the camera's main mode +0x139: 2 (a bound actor, the
   follow -- `FUN_002956e0` turns 6 into 2 when the bound object is not a spectator, D:L139647-139648) runs
   `FUN_00296f10` (D:L141991-141999), whose orbit is `FUN_00297410` (D:L140696-140697). No call in either clears the
   camera's actor +0xbc or picks another: the first-living-seat rule (`FOLLOW_OFF_DEAD_READING`'s port rule) has no
   counterpart in the chain.
2. `FUN_00297410` starts the death camera (+0x144 = 1, D:L140910) only when +0x144 is 0, the bound actor is dead (its
   state +0x174 == 8, or its sub-state +0x2b == 8, D:L140893-140895) **and its controller's vtable +0x2c answers**
   (D:L140896-140902) -- the local player's: the network controller's +0x2c answers "not local" (research 205, the
   SEAL controller class map; research 217's and 179's `RemoteRespawn` reading). With +0x144 still 0, the dead bound
   actor is orbited as before, the turn stepping by dt x -2.5132742 rad while its state is 8 (D:L140915-140918), and an
   online spectator in follow (+0xf4 == 1) is stood by `FUN_00294b40` off the bound object (D:L140957-140960).
3. **A spectator never runs the death camera for the player it follows.** While it follows, the bound actor is another
   console's -- its controller the network's, +0x2c 0 -- so 2 never sets +0x144 (the initialiser's 0, `FUN_00299150`
   D:L141657). The spectator's own object is bound only in free (`FUN_002956e0` compares the bound object with the local
   one, `FUN_002b3580`, D:L139698-139705), and is excluded from the death camera by D:L140905-140908 (online, a
   spectator, mode 6); mode 6's frame runs `FUN_002964f0` (D:L142016-142017), never `FUN_00297410`. So the spectator's
   follow stays on the dead body, bound, until something else binds the camera (a cycle, a jump, X; §5.1). *(Corrected
   2026-10-16 by AD-8's review, F1: was "a spectator has no actor of its own", which the bind's local-object test
   contradicts.)*
4. **The rebinds the chunks cite are the offline death camera's.** `FUN_002980d0` (D:L141340-141639, run by
   `FUN_00297a30`'s first call, D:L141126) saves the dead actor (+0x150, D:L141353) and its killer (+0x154: the actor
   list's entry for the dead actor's +0xfc4, a type-2 entry or none, D:L141354-141361); offline (`DAT_0045a0c1` 0, the
   network flag; research 114) it enters state 2 (D:L141363-141368), online state 6 when there is no killer or the
   killer is the dead actor itself, else 3 (D:L141369-141376), and online state 7 when the bound actor's controller is
   not local (D:L141378-141389). The three rebinds are `FUN_002956e0` onto the saved actor in state 4 (D:L141484), onto
   the killer in state 2 (D:L141529: state 2 -> 4) and onto the saved actor when the stick moves in state 4
   (D:L141615-141617). States 2 and 4 are entered only from the offline arm (D:L141366, D:L141528), so **online none of
   the three runs**: the online death camera's state 3 orbits the dead actor turned toward the killer
   (`FUN_00297a30` D:L141145-141215, the killer's place +0x154 read, never bound), 6 turns at 0.8725 rad/s
   (D:L141216-141218), 7 follows the stick (D:L141219-141222). And with +0x144 at 7, `FUN_002956e0` binds nothing that
   is not an actor or is the object already bound (D:L139710-139714).
5. So for the port's spectator (always online): the dead body is kept, and there is no killer or saved-actor rebind --
   the chunks' "not permanent binding in every state" holds for the local player's death camera offline, not for a
   spectator's follow. The dead player's own death camera online (states 3 / 6 / 7) is the walk's (research 248 §6
   F2), not AD-8's.

**2. Departure: the actor retired, the camera untouched.** The network's leave callback `FUN_002bef60` (registered at
D:L162712; body D:L162520-162539) acts only for a player id not the console's own (D:L162520-162521) whose record is an
'S' with an object (D:L162522-162523) holding an actor association (+0x8c, D:L162524-162525); it may save the actor's
place in the game record (+0x104..+0x110, D:L162526-162532, a tracked-target case), clears the actor's +0xfcf and sets
+0xfd1 (D:L162533-162534), retires it through `FUN_005998b0` only when its first parameter is non-negative
(D:L162535-162537), and detaches the association (D:L162538). `FUN_005998b0` (D:L455507-455535) acts only on an actor
whose controller's vtable +0x34 answers (D:L455510-455516) and whose identity is not already the retired one
(`DAT_003effb0`, D:L455516); it then unregisters the id (D:L455517-455520), writes the health 0 (`FUN_005477a0(0, ...)`,
D:L455521; D:L412828-412839), clears +0xfb4 (D:L455522) and the team mask (`FUN_0029ed10`, D:L455523), gives it the
retired identity (D:L455524) and **state 8** through its vtable +0x90 (D:L455525). The camera is not touched: a
spectator following the leaver stays on the retired actor, now in state 8 -- 1.2's dead arm. Nothing clears every
state; the actor stays in the list until it is deleted (3).

**3. Deletion: one queued removal per invocation.**
1. `FUN_0029fbc0` (D:L145326-145329) appends an actor to the pending-removal list at 0x436300. `FUN_0029f510`
   (D:L145118-145123) deletes **the first pending entry only** (`FUN_0029f850` on the list's head, when its count is
   not 0), then runs the actor list's slot +0x14 for each. `FUN_0029f850` (D:L145217-145247) takes the entry off the
   list, makes the placeholder object once, calls every listed actor's slot +0x54 with the removed one (the ELF's
   0x553e00-0x553e10 forwards to the controller's +0x48; the three human tables' entry returns at once,
   0x597ff0-0x597ff4 -- chunk 07), rewrites the others' relation records onto the placeholder (`FUN_002a0de0`), puts
   the placeholder in the removed one's list node and destroys it (vtable +8).
2. *`FUN_0029f510` is a registered task*: registered at D:L50922 among a run of registrations whose first arguments climb 0.8 / 0.9 / 1.0 / 3.0 / 4.5 (D:L50920-50924) -- likelier an ordering than a period; its rate is unread. After its one removal it runs every listed actor's slot +0x14
   (D:L145122-145123), so it is likely the actor list's per-frame tick. Two queued removals take two runs. *(AD-8's
   review, F4: the call is cited, not written out.)*
3. *Who queues a removal*: `FUN_002b2310` (D:L155547-155566), called from the body's own clean-up after a timer
   (`FUN_0056ee80` D:L432650-432688, `+0x6f0` against `DAT_00436630` / `DAT_00436634` (D:L432688)) and from a message's handler
   (`FUN_005dd990` D:L493130-493142). The retirement (2) queues nothing: when a retired leaver is deleted is the body's
   clean-up, not read here.
4. What the spectator's camera follows once its actor is deleted is **not read**: no line in `FUN_0029f850` writes a
   camera's +0xbc / +0xc0 / +0x10c, and whether the camera is notified (an entry of the list, or through slot +0x54) is
   unread. The chunks' word stands: no camera replacement is invented (`FOLLOW_AFTER_DELETE_PLACEHOLDER`, §8).

**Against the port** (`spectatorView.ts` `follow`, :559-565; `FOLLOW_OFF_DEAD_READING`, :170-179): the port moves a
spectator off a dead or gone body to the first living body in seat order the next frame. The original keeps a dead body
(1), keeps a departed one retired in state 8 (2) and deletes queued removals one per run (3). The port's room drops a
leaver's body from the next snapshot at its `left`, so the page sees no retired body: the port's stand-ins are named in
§8 (`FOLLOW_RETIRED_BODY_PLACEHOLDER`, `FOLLOW_DELETE_QUEUE_PLACEHOLDER`, `FOLLOW_AFTER_DELETE_PLACEHOLDER`). The
benched dead player's teammate view (`followWatched`, NU-11's ghost included) also moves off a dead teammate; 1.4's
reading suggests the original's does not (+0x144 at 7, D:L139710-139714, D:L141378-141389), but the brief keeps it
unchanged -- a finding for the seat, not AD-8's. *(Read and built 2026-10-17 by DEAD-WATCH, §5.6: kept on the dead body.)*

### 5.5 The turnover: the spectator's mode and zoom reset (AD-9, 2026-10-17)

Web sprint 40's AD-9 (the reconciliation's claim C82; chunk 05 of `plans/inventory/2026-10-15/reconciliation/`, its
"Turnover" paragraph). Chunk 05 had no independent review (W40.R4), so this is that review: every function and line it
cites re-read at the source by AD-9's implementer, who did not write it (source inspection; no test, no run), with the
event the chunk left open ("map exact reset events") read on from research 115 §8 and §5.4 above. Where the re-read
confirms the chunk, the part is **reading**; what this re-read adds -- the online turnover's event and order (2, 3), the
projection (4), the follow's end (5) -- is **reading, pending review**. Nothing is measured on the original running: the
first frame after a turnover is ONL-32's trace (W40.R5; §9).

The camera block the spectator's pad drives is the camera's +0xf4 onward (`FUN_0029b0c0` hands `FUN_00295260` the camera
+ 0xf4, D:L142660): +0xf4 the mode (0 free, 1 follow, 2 scenic), +0xf5 the remembered mode, +0x10c the followed actor
X returns to (the block's +0x18, D:L139527), +0x110 the scenic index (+0x1c, D:L139521-139523), +0x118 the
magnification (+0x24, D:L139485). The camera object is `DAT_00415ff0`; its vtable 0x406170 (the disc ELF: +0x8
`FUN_002998f0`, the frame; +0xc `FUN_0029b3c0`, the attach, research 244 §3.1).

**1. The reset -- agreed, reading.** `FUN_00299150` (D:L141654-141673) writes the mode 0 (D:L141664), the remembered
mode from it, so 0 (D:L141665), the scenic index -1 (D:L141666), +0x114 0 (D:L141667), +0x104 / +0x108 0 and **the
followed actor +0x10c 0** (D:L141668-141670), and the magnification 1.0 (D:L141671), with the death camera's +0x144 0
and +0x148 0 (D:L141657, D:L141663). It writes all of them unconditionally -- no 0.01 test, unlike the pad's and the
bind's resets (D:L139485-139486, D:L139687-139688) -- and touches neither the bound object (+0xbc / +0xc0) nor the main
mode +0x139. Chunk 05's `FUN_002a7d40` D:L149685 -> `FUN_00299150` D:L141664-141671 holds. Its callers are six: D:L75869
(`FUN_002232a0`), D:L149685 (`FUN_002a7d40`), D:L150568 and D:L150604 (the offline exit, `FUN_002a9a70` /
`FUN_002a9b30`), D:L455687 and D:L455694 (the respawn's local-actor arm, `FUN_00599b60`).

**2. When it runs: the online turnover is the MP exit state's tick on game state 3 or 5 -- reading, pending review.**
Chunk 05's turnover citation, `FUN_001ecb10` D:L51046-51049, holds as text but is **the offline replay, not the online
turnover**:
- `FUN_001ecb10` is `CCoreState`'s slot +0x24 (the disc ELF's vtable at 0x404f60, typeinfo "CCoreState"), which the
  game-state machine `FUN_002ce9e0` calls as OnPop(arg) when the state over it pops (D:L171918-171925; research 115
  §8.1). Its bind and restart -- `FUN_002abd40` (D:L51048) and `FUN_002a7d40` (D:L51049) -- run only for arg 1
  (D:L51046). The pop requests with arg 1 are two (`FUN_002cf2f0(.., 1)`, D:L172222-172240): the offline exit state's
  Init (`FUN_001f1bb0` D:L53475-53476; the state 0x4086a0, pushed only offline, D:L150592-150605 and through
  `FUN_002a9a70` from the core tick's offline arm, D:L50781-50789) and `ReplayMission`'s offline arm (`FUN_00280040`
  D:L127387-127388). Online `ReplayMission` takes game state 5 on the host (D:L127390-127392) and does nothing on a
  client.
- The online round's end pushes the MP exit state (0x4086c8; research 115 §8.2): the host 3 s into the end
  (`FUN_002a9b30` D:L150629-150670, game state +0x113 4, or 6 at the match's end, D:L150661-150666), a client on the
  host's 4 or 6 (D:L151127-151134); no role test, so a spectator's console pushes it too. Its tick `FUN_00223680`
  (D:L75899-75958) waits on the game state: 1 pops and switches to the menu state (D:L75915-75918); **3 or 5 is the
  next round** (D:L75920-75938); anything else keeps the round screen (D:L75940-75955). The host reaches 5 by ROUND
  COMPLETE's `WAIT 5` and `ReplayMission` (research 179, "The screens' timings"; D:L127391); a client by the host's game object
  (D:L75921-75922 sends it; the host's restart then writes 3, D:L149761-149762).
- On 3 or 5, in this order, on every console: the host re-sends the game object (D:L75921-75922); `FUN_0029fcb0`
  (D:L75924, not read); **each type-2, unretired actor is respawned** (`FUN_00598b90`, D:L75925-75933), whose online
  path rebuilds it through `FUN_00599b60` (D:L455158) -- for the console's own actor (its controller's +0x2c answering,
  D:L455681-455684): a player's arm resets the camera (D:L455693-455694), a spectator's arm makes the actor unseen
  instead (`FUN_00543d50`, D:L455697-455698), and either then attaches the camera to it (the camera's +0xc,
  D:L455701 -> `FUN_0029b3c0` -> the bind `FUN_002956e0`, D:L142768); `FUN_003aa9d0` (D:L75934, not read); **the
  restart `FUN_002a7d40`** (D:L75935): the reset (D:L149685) and, online, the HUD's round reset (`FUN_001fb420`,
  D:L149758; item 4); then the pop request with arg 0 (D:L75936). The pop is applied on the machine's next tick: the MP
  exit state's UnInit `FUN_002232a0` **resets again** (D:L75869), and the core state's OnPop(0) runs neither the bind
  nor the restart (D:L51046). No direct camera write follows the UnInit's reset (its later callees, D:L75870-75876, and
  the OnPop's, D:L51042-51055, walked three calls deep: no `DAT_00415ff0`, bind, attach or reset; virtual calls not
  followed). So at a turnover the last writes to the five fields are the reset's: free, remembered free, no scenic view,
  no followed actor, magnification 1.
- **Not a turnover**: a death (§5.4 item 1: no reset in the follow's frame or the death camera's chain); a bind
  (`FUN_002956e0` D:L139677-139708 writes the remembered mode from the mode -- 0 or 1, scenic kept -- resets the
  magnification only out of scenic, and sets the mode 0 for the console's own object or 1 with +0x10c for another;
  research 244 §3); the match's end (game state 6 keeps the round screen; the match leaves by the state 1 pop or
  `CloseAndSwitch`, D:L128101-128133, research 309 §2.1 -- the UnInit's reset runs at that pop too, before the menu
  state, but no round follows). **The spectator's entry also starts from the reset**: the map load binds the console's
  own object (`FUN_001ea720` D:L49730-49732, from the load's thread `FUN_001ebda0` D:L50728) and the core state's Init
  `FUN_001ec480` then runs the restart (D:L50946) -- the start `SPECTATOR_START_READING` already holds (research 244
  §3), now with the magnification.
- The port's stand-in for the event: it has no MP exit state; the room's next-round start (`roundStart`) is where its
  page leaves the round screen for the next round, so that is where the reset is applied
  (`SPECTATOR_TURNOVER_EVENT_READING`, §8).

**3. The bind events -- agreed for the offline replay, reading; the online turnover's, reading, pending review.**
Chunk 05's "local bind `FUN_002abd40` D:L151884-151885" holds: the mission's re-initialisation attaches the camera to
the console's own object (`FUN_002b3580`) through the camera's +0xc (D:L151884-151885); its one caller is
`FUN_001ecb10` (D:L51048), so it runs at the offline replay's pop(1) only, **before** the restart's reset (D:L51048
then D:L51049). Online, the turnover's one bind is the respawn's attach (item 2, D:L455701), also **before** the reset
(D:L75931 then D:L75935): a bind writes the remembered mode and the mode, and the reset then overwrites both. Which
object the camera is bound to after the turnover is not settled by the reset (it leaves +0xbc / +0xc0): if the
spectator's own actor is one the loop respawns (an entry of type 2, not retired, D:L75927-75930 -- unread for a
spectator's actor), the camera is attached to it, its main mode +0x139 set 6 (D:L139651-139664) and placed from that
object (`FUN_0029b3c0` D:L142748-142781, the entry's unread placement, `SPECTATOR_ENTRY_POSE_PLACEHOLDER`); if not, the
camera stays bound to the actor it followed (respawned in place) with +0x139 kept 2 (`FUN_0029b330` D:L142720-142725,
from `FUN_001f1880` D:L53355), orbiting it while the pad's mode reads free. The first is the likelier (the respawn's
spectator arm D:L455697-455698 exists for that actor), not read: `SPECTATOR_TURNOVER_POSE_PLACEHOLDER` (§8).

**4. The scenic zoom at 4 (or any m) -- reading, pending review.** A spectator zoomed in scenic to 4 at the turnover is at
1 after it: the reset writes +0x118 = 1 unconditionally (D:L141671), and the restart's HUD reset sets the picture's
projection to magnification 1 -- `FUN_002a7d40` -> `FUN_001fb420` (D:L149758) -> `FUN_001f1880` (D:L57659) ->
`FUN_0029b2f0(1.0, camera)` (D:L53354; the projection's three words, D:L142701-142706, the same writes as the scenic
frame's D:L140524-140528) -- so the picture is not left magnified while the mode reads free. (The reset alone does not
write the projection; the scenic frame writes it only in mode 2, D:L140512.) The same HUD reset runs at the entry
(D:L50946 -> D:L149758).

**5. The follow across the turnover -- reading, pending review.** A spectator following a player is in free after the
turnover, the followed actor forgotten (+0x10c 0, D:L141670) and the remembered mode free (D:L141665): X then does
nothing (from free with a remembered free, `FUN_00295260` D:L139518-139528 runs neither arm; `spectatorToggle`), until a
cycle (Right / Left), the jump (Triangle) or a scenic view (Up / Down) binds or enters one. A spectator in scenic is in
free, the scenic index -1 (D:L141666), so the next Up / Down steps from no view (`FUN_002ab260`). The benched dead
player's teammate view (NU-11) is not the spectator's: the console's own player actor takes the respawn's player arm --
the reset and the attach to itself (D:L455693-455695, D:L455701) -- which the port's `reset` already stands for (the
bench left, the magnification 1); AD-8's follow (the dead body kept, the removal queue) is untouched: the reset clears
the followed actor, not the actor list.

**Against the port** (`spectatorView.ts` `reset`, :458-466): at a round's turnover the port leaves a spectator's mode,
remembered mode, target, scenic index and magnification as they were (its comment: "which camera binds a round's
turnover runs is unread"). The original resets all five (items 1, 2, 4, 5). *Built 2026-10-17 (AD-9 step 2, on the seat's word; the review's F2: the page's unbench also runs it at `abandoned` -- the original's camera at that dialog, `FUN_002bc530`, unread -- and at `promoted`, harmless): a spectator's `reset` -- the page's unbench at `roundStart` (`SPECTATOR_TURNOVER_EVENT_READING`) and at its welcome (the entry's same reset) -- sets the mode and the remembered mode free, the scenic index -1, no target and the magnification 1, the page told 1; no pose handed (`SPECTATOR_TURNOVER_POSE_PLACEHOLDER`), so the page shows the free info box with no followed name and X does nothing until a cycle, the jump or a scenic view; the retired leavers' queue (AD-8) and a benched player's reset (NU-11) unchanged; `spectatorView.test.ts`'s AD-9 block. No change outside `spectatorView.ts`: the page's projection follows the told magnification (`spectateMagnify`, W6).*
*Excluded 2026-10-17 (REPLAY-SEEK-KEEP, issues #270 and #271; a **browser adaptation**, no original -- the original has
no replay seek): the welcome's unbench is skipped for the replay's watcher (`netPage.ts`, `if (!this.replayClock())`).
A replay seek's welcome is the fold's carrier (W37.R4), not the entry (`FUN_001ec480` D:L50946), so a seek keeps the
watcher's mode, remembered mode and target -- the same kind of guard as RE-3's (the countdown kept) and PAR-94d's (no
banner). Its edge, named: a seek landing in a LATER round keeps the follow too, though a live turnover would have reset
it -- the seek replays no `roundStart`, the event the reset stands on (`SPECTATOR_TURNOVER_EVENT_READING`); a
`roundStart` played through still resets. `replaySpectate.test.ts`'s REPLAY-SEEK-KEEP block (End and a step back keep
free / follow / 3 and X follows again; the followed name `spectatorHudView` reads kept; the edge; the counter-pin).*

### 5.6 The dead watcher's teammate at its death (DEAD-WATCH, LATER 69, 2026-10-17)

Web sprint 40's DEAD-WATCH (the online seat's brief `plans/briefs/2026-10-17-dead-watch-read.md`, Part 1), on §5.4's
item 1.4 and its last paragraph. Each line below re-read at the source by DEAD-WATCH's implementer (source inspection; no
test of the original, no run); **reading, pending review**. Nothing is measured on the original running: the first frame
after a watched teammate's death is ONL-32's trace (W40.R5; §9).

**The answer: the view stays on the dead teammate's body.** A dead player (classic, or a ghost) watching a teammate keeps
watching that teammate's body when it dies; nothing moves the view on, and nothing releases it to the own body, until the
player presses Right or Left (or the round turns over, §5.5; or the own actor respawns, below).

1. **Who picks the watched actor: the player, on a release only.** The dead actor's update `FUN_00547350` (a vtable
   entry; no direct call) runs the cycle online when the actor's `+0xfcd` (next) or `+0xfce` (previous) is set
   (D:L412733-412750), walking with argument 1 for a non-spectator page (D:L412736-412742): `FUN_00547170` (next,
   D:L412749) or `FUN_00546fa0` (previous, D:L412745). The two bytes' only writers are `FUN_00553ea0`, which only zeroes them (D:L419474-419475) at
   the actor's set-up, each respawn's included (`FUN_00599b60` D:L455663), and the pad latch `FUN_00592560` (Right / Left just released, `== 3`, D:L451683-451694). So no death,
   timer or event cycles the view.
2. **The walk starts from the camera's actor and binds what it finds.** Each walk starts at the slot of the camera's
   bound actor (`FUN_0029f180(DAT_00415ff0[0x2f])`, the camera's +0xbc, D:L412584, D:L412637), steps a slot at a time
   and binds the first candidate through the camera's vtable +0xc (D:L412618, D:L412675; `FUN_0029b3c0` ->
   `FUN_002956e0`, D:L142768).
3. **The death camera holds a remote teammate at 7 and binds no one online.** The own death starts the death camera
   (`FUN_00297410` D:L140893-140910: the bound actor dead and its controller's +0x2c answering, the local one's), whose
   first frame `FUN_002980d0` enters 6 or 3 online (D:L141369-141376). Once the cycle has bound a teammate -- another
   console's actor, its controller's +0x2c 0 -- every frame of `FUN_002980d0` sets +0x144 = 7 (D:L141378-141389). Its
   three rebinds (D:L141484, D:L141529, D:L141616) sit in the states 2 and 4, entered only offline (D:L141363-141368,
   D:L141528), and its stick check binds only from 4 (D:L141613-141617) and itself sets 7 (D:L141619). And with +0x144 at 7
   `FUN_002956e0` refuses a bind of a non-actor or of the object already bound, +0xc0 (D:L139710-139714). So at the watched
   teammate's death the camera keeps +0xbc: `FUN_00297410` starts nothing (+0x144 is not 0, D:L140893), and 7's frame
   turns the view with the stick about the bound actor (`FUN_00297a30` D:L141219-141221).
4. **No other bind runs at a teammate's death.** Every direct bind of the camera in this decompilation, by `grep` of
   `FUN_002956e0`, its thunk (0x295af0) and the vtable +0xc call on `DAT_00415ff0`: the spectator's controls (D:L139442,
   D:L139527), the offline death camera's three (item 3), the level load (`FUN_001ea720` D:L49732), `FUN_002abd40`
   (D:L151885) and the level's unload (`FUN_002ac0e0` D:L151957, a 0), the cycle's two (item 2), the local actor's set-up
   (`FUN_00599b60` D:L455701), the camera's constructor binding the page actor (`FUN_0029b5d0` D:L142876, its
   one call at start-up, D:L49112), and the vehicle's mount and dismount, each only when the camera's actor is the actor
   mounting (`FUN_005463c0` D:L412190-412191, `FUN_00545ee0` D:L411976-411977). The viewed actor's death edge in the HUD
   frame (`FUN_001f7ff0` D:L56632-56647) calls the HUD's own element and, for the page's own actor only, closes the Chat
   menu (research 227 §2.9); it binds no camera.
5. **The way back to the own body is the cycle.** For a non-spectator page the walk's candidate test takes a living
   actor **or the page's own actor** (`DAT_00440c38`, alive or dead: D:L412605, D:L412658), a type-2 entry, of the
   page's side and no escortee (D:L412607-412609, D:L412660-412662). So a dead player's Right / Left passes through its
   own body among its living teammates (research 248 §5's open "return from teammate viewing to own body"; the cycle's
   own HUD line still says "living teammates", `FUN_001f97b0` D:L57059-57060). At the turnover's respawn (§5.5)
   `FUN_00599b60` resets the camera (`FUN_00299150`, D:L455694) and binds it to the own actor (D:L455701).

**Against the port** (`spectatorView.ts` `followWatched`): the port moved a dead watcher on to the next living teammate
the frame its watched teammate died (NU-11). *Built 2026-10-17 (DEAD-WATCH; reading, pending review):* `followWatched`
follows the watched teammate's body dead or alive; a body gone from the room's list hands no pose, the view left where the
last pose stood it (the stand-in of `FOLLOW_RETIRED_BODY_PLACEHOLDER` and `FOLLOW_AFTER_DELETE_PLACEHOLDER`, §5.4 items 2
and 3: the original keeps a leaver's retired actor bound). Unchanged, as the brief asks: manual cycling and AD-9's reset
(viewer `spectatorView.test.ts`'s LATER 69 case and the follow-pose case; `nu11GhostWalk.test.ts`'s page-level case).

**Left, recorded, not built** (manual cycling is outside this brief):
- ~~The own body as a cycle stop (item 5): the port's `teammates` leaves out the own seat, so a dead player never cycles
  back to its own body. LATER 78 ("a dead player's Right / Left can stop on his own body", filed on `agent/online`).~~
  *Built 2026-10-17 by DEAD-CYCLE, below.*
- ~~The cycle from a dead watched teammate (item 2): the original steps on from that actor's slot; the port's `nextFollow`
  / `previousFollow` start from the first / last living teammate in id order when the current is no candidate (AD-8's
  "manual cycling unchanged" case; the slot order is `SPECTATOR_CYCLE_ORDER_READING`'s).~~ *Built 2026-10-17 by
  DEAD-CYCLE, below.*

**The walk, re-read (DEAD-CYCLE, LATER 78 + 79, 2026-10-17).** The online seat's brief
`plans/briefs/2026-10-17-dead-cycle.md`. Each line re-read at the source by DEAD-CYCLE's implementer, who did not write
items 1-5 above (source inspection; no test of the original, no run). Items 2 and 5 above are **agreed**; what this
re-read adds -- the walk's direction, wrap and stop (W2-W4), the spectator's start (W5), the own view after the cycle
(W6) -- is **reading, pending review**. Nothing is measured running: ONL-32's capture of a dead player's and a spectator's
Right / Left is the measure.

- **W1. The candidate test -- agreed.** Both walks take an entry of the actor list `0x4362e0` (`FUN_0029e470`, the
  n-th node's payload, 0 past the count, D:L144674-144684) that is a type-2 object (+0x10 == 2, D:L412598, D:L412651),
  not a spectator when online (`FUN_002c2fd0` -- the local object's own flag, another's record word & 0x10000,
  D:L164619-164640 -- D:L412601-412603, D:L412654-412656), and **alive (+0xe1 bit 4) or the page's own actor**
  (`DAT_00440c38`, the getter `FUN_002b3580` D:L156213-156216; D:L412604-412605, D:L412657-412658), type 2 again
  (D:L412606, D:L412659), and with argument 1 only, sharing a team bit with the walking actor (`param_1 + 200`, the
  page's own dead actor whose update `FUN_00547350` runs) and no escortee bit (0x20000; D:L412607-412609,
  D:L412660-412662). The argument is 1 unless the page's own object is a spectator online (D:L412735-412742).
- **W2. The start -- agreed.** `FUN_0029f180` returns the bound object's +8, -1 for none (D:L145045-145048), applied
  to the camera's +0xbc (`DAT_00415ff0[0x2f]`, D:L412584, D:L412637): the walk starts at the bound actor's slot,
  whatever that actor is -- alive, dead or retired (AD-8's departure leaves the camera untouched, §5.4 item 2).
- **W3. The direction and the wrap.** Next (`FUN_00547170`): slot + 1 (D:L412639), up a slot each pass (D:L412663), to
  slot 0 past the count or at an empty lookup (D:L412646-412648, D:L412664-412667). Previous (`FUN_00546fa0`): slot - 1
  (D:L412586), down a slot each pass (D:L412611), below 0 to the count - 1 (D:L412592-412594), an empty lookup passed.
- **W4. The stop.** The loop runs while the slot is not the start (D:L412615, D:L412672), so **the start is never
  tested**: a bound actor that is itself a candidate is never re-taken, and with no other candidate nothing is bound
  (D:L412617, D:L412674). A guard of count + 1 passes (D:L412612-412614, D:L412669-412671) ends a walk that cannot
  return to its start (from none, -1). The first candidate found is bound through the camera's +0xc (D:L412618,
  D:L412675). So a dead player's stops are, in slot order, his living teammates **and his own body**, and Right / Left
  step from the actor watched -- dead or gone included -- to the next / previous stop: self 1, teammates 2, 5, 9,
  watching 5 when it dies, Right takes 9 and Left 2; self 5 among 2 and 9, Right goes 9, 2, the own body, 9.
- **W5. A spectator: the same walk, from its bound object.** The spectator's Right / Left are the same latch and the
  same walk with argument 0 (232 §5.3, 248's table): every living type-2 non-spectator, either side, the hostages too
  (`SPECTATOR_HOSTAGE_READING`); its own object is a spectator and is refused before the own-actor test
  (D:L412601-412603), so **the own-body stop is a dead player's only**. Its start is the camera's bound object: in
  follow the followed actor, dead or gone (AD-8); in free and scenic its own object -- X from follow writes +0xbc /
  +0xc0 with the local object (D:L139501-139504), Up / Down onto a view do the same (D:L139552-139555,
  D:L139580-139583), the entry binds it (`FUN_00599b60` D:L455701; `SPECTATOR_START_READING`) and the turnover likely
  does (`SPECTATOR_TURNOVER_POSE_PLACEHOLDER`); X from scenic and X from free into scenic bind nothing (D:L139482-139484,
  D:L139519-139523), so free and scenic are always on the own object. Where the spectator object's slot sits among the
  players' is unread: `SPECTATOR_OWN_SLOT_PLACEHOLDER` (§8; the port's stand-in, before every player, gives the first
  living for Right and the last for Left -- as a slot after every player would).
- **W6. The own body's view after the cycle.** The cycle back binds the own actor (W4). The death camera's +0x144 is set
  7 every frame a remote teammate is bound (`FUN_002980d0` D:L141378-141389) and nothing but the initialiser writes it
  back (`FUN_00299150` D:L141657; the respawn and the turnover, §5.5): a local bound actor does not, and `FUN_00297410`
  starts nothing while it is not 0 (D:L140893). So the original's own view after the cycle is state 7's frame, the
  orbit about the own body turned by the stick (`FUN_00297a30` D:L141219-141221), not the 3 or 6 the death began in
  (D:L141369-141376). The port's death camera has no state 7 (`deathCamera.ts` models 3 and 6):
  `DEAD_CYCLE_OWN_VIEW_READING` (§8).

**Against the port** (`spectatorView.ts` `cycleTeammate`, `spectatorAct`; `net/rules.ts` `nextFollow`, `previousFollow`):
the dead player's stops left out its own seat (LATER 78), and every walk started from the first / last candidate when
the current one was none (LATER 79) -- for a spectator from the kept target even in free and scenic. *Built 2026-10-17
(DEAD-CYCLE; reading, pending review):* `nextFollow` / `previousFollow` step from the start's place in id order, a
candidate or not, never re-taking it, null with no other candidate (W2-W4; `nextFollow`'s callers are the two cycles,
both corrected by this read, and an e2e line, `replayEngine.spec.ts`'s followed body after a seek, which still held the
pre-AD-8 "on to the next" rule and now keeps the body -- DEAD-CYCLE's review F2); the benched dead player's and the ghost's stops are the living teammates and the
own seat, from the watched teammate or the own body, and reaching the own seat sets `watching` null and calls the
host's optional `returnSelf` (W1, W6); the spectator's walk starts at the followed body in follow and at the own object
(`SPECTATOR_OWN_SLOT_PLACEHOLDER`) in free and scenic (W5). Unchanged: AD-9's turnover reset, DEAD-WATCH's kept body,
AD-8's retired and deleted bodies. The page's half (the review's F1; the hunks cleared by the gameplay seat, the row
landing whole): `netPage.ts`'s host wires `returnSelf` to `WalkMode.resumeBody` (`walk.ts`), the walk again where the
walker stands -- not re-placed at the fly camera's pose -- with its death camera on the own body
(`DEAD_CYCLE_OWN_VIEW_READING`); without it the walk stayed in fly mode at the last teammate's pose, free to scout.
Tests: `spectatorView.test.ts`'s DEAD-CYCLE block and the
corrected cases, `rules.test.ts`, `nu11GhostWalk.test.ts`'s DEAD-CYCLE cases (the own body's stop, and the walk back: feet kept, walk mode, the death camera's eye).

### 5.3 The pad (`SPECTATOR_PAD_PLACEHOLDER`)

Settled before this note (R314.8): `FUN_00295260` tests bytes +7, +10, +5, +6 (D:L139476, D:L139480, D:L139531,
D:L139559) and `FUN_00592560` the cycle's +3, +4 (D:L451683, D:L451689), each `== 3`; the
slots are the raw pad's (research 94: +3 Right, +4 Left, +5 Up, +6 Down, +7 Triangle, +10 X). Nothing to read; the
roadmap's line is corrected in the docs row (§7, W7) -- *done 2026-10-14 (WATCH-DOCS)*.

## 6. How it leaves

- **ABORT** (the START menu): built (266 §8.10, MATCH-02) -- `dlgNetAbort.rdr`, #529 / #531, SOCOM II ONLINE.
- **VOTE ALL's eject**: every console sets `MaxSpectatorsValve` 0 and a spectator opens `dlgNetBanned.rdr`
  (D:L159602-159610, `FUN_002b9d80` D:L159626-159634; 264 §4.2). The room's half and the `kicked` 'vote' route are
  built; the dialog's screen (#539) is ONL-22's.
- **No players left**: the host with both sides empty, a game in states 2..5 and spectators present switches to
  `dlgNetAbandoned.rdr` (S:0x3f2a50; `FUN_002c4500` D:L165674-165676). Built as the room's side-empty abandon
  (`ABANDON_TRIGGER_READING`, `bridge.ts`), its capture owed (owner list 5).
- **The match's end**: GAME COMPLETE's `ExitOnStart` runs on every console with no team test (P:L14601-14620), so the
  spectator returns to the same game's GAME LOBBY with the players, its word 0x10000 untouched by an alternate game's
  swap (309 R309.6), `ClanSwapSidesIndex` counted like anyone's. **The port has no return for anyone** (309 R309.3):
  ONL-20b, being built in sprint 19's first half; once it lands, a watcher's return is one more case of its tests.
- **The lobby's BACK**: `exit_lobby` (#362, #363, `DisconnectFromGameServer`, the passwords cleared, `ReturnToBriefingRoom`,
  P:L7702-7744), the same for a spectator; built (165 §3).

## 7. What ONL-21 builds

The smallest rows, each with its failing test first. **About 12 points**: the join's rows W1-W3, W7 and W8 are 7 (M, the
roadmap's size; W8 added by the review's F2); the camera's W4-W6 are 5 and may be cut as a slice of their own (**ONL-21b**), the camera and HUD
being built and these parity corrections.

1. **W1 -- the spectator password asked (S, 1).** `lobby.ts`: a game whose spectator password is non-empty carries
   `SECURITY_LEVEL.SpectatorPassword` (4) in its security level beside `PlayerPassword` (1) -- its create and every
   record the list serves (`SPECTATOR_PASSWORD_SECURITY_BIT_READING`). *Test first*: `packages/central/test/lobby.test.ts`
   (a game created with a spectator password lists security 4, with both passwords 5, with neither 0);
   `packages/ui/test/screens/gameLobbyScreen.test.ts` (WATCH GAME on such a game opens the keyboard on
   `SpectatorGamePassword` with #252's title; the right password seats, a wrong one "Password incorrect."; JOIN GAME on
   it asks no password when it has no game password). *Built 2026-10-14 (WATCH-JOIN), reading pending review; the title
   the disc's command carries is #423, not #252 (§2.1), and the test pins #423.*
2. **W2 -- "Too many spectators" from the host, not the services (S, 1).** `lobby.ts` `joinGame` bounds a watcher by
   the game's MaxPlayers sum only (its spectator-slot test removed, research 154 §6's departure retired); the room's
   watcher past `maxSpectators` is refused `TOO_MANY_SPECTATORS` ("Too many spectators"), not "The game is full."
   (`WATCH_SLOTS_HOST_REFUSAL_READING`). The page's half exists (`seatEnded`, SVC-23f). *Test first*: `lobby.test.ts` (a
   watcher past byte 4 admitted below the sum, refused `WorldIsFull` at it); `packages/central/test/room.test.ts` (a
   watching hello past `maxSpectators` refused with that text, a playing hello's queue unchanged);
   `packages/central/test/bridge.test.ts` (over real sockets: a third watcher of a 2-slot game refused "Too many
   spectators"); `gameLobbyScreen.test.ts` (that refusal: MP_EJECT_SPECTATOR's popup, #527, the BRIEFING ROOM). *Built
   2026-10-14 (WATCH-JOIN), reading pending review; the page's case is SVC-23f's, its title widened to name W2.*
3. **W3 -- the late watcher watches the round in progress (M, 3).** `gameLobbyCommands.ts`: a watcher whose first view
   is launched shows #352 (the script's), and on YES goes to the load and the match at once -- the hand-off with the
   welcome and no `roundStart` -- instead of waiting for `roundStart` (`LATE_WATCHER_IN_PROGRESS_READING`; the ghost's
   `LATE_JOINER_NEXT_ROUND_READING` unchanged). *Test first*: `gameLobbyScreen.test.ts` (a watcher into a launched game:
   #352, YES -> `LOAD_SCREEN` with no `roundStart`; NO -> `exit_lobby`; a player into it: #353 and the wait, as today);
   `packages/viewer/test/frontEndMatch.test.ts` (the hand-off mounts the spectator in the running round). **Touches
   `gameLobbyCommands.ts` beside ONL-20b's `matchReturned`**: a hot-file claim to share with ONL-20b's builder, or W3
   after it. *Corrected and built 2026-10-14 (LATE-WATCH, W19.R12), reading pending review: YES only waits and the late
   seat's READY goes to the load -- `ReadyToLoad`'s late branch (§4.2), every late seat with no team test: the watcher
   spectates the running round, the late player loads as the ghost, seated from the next round; the ghost's lobby wait for
   `roundStart` gone. `READY_LOADS_LATE_JOINER_READING` replaces `LATE_WATCHER_IN_PROGRESS_READING`; a late seat that never
   presses READY is `LATE_SEAT_NEVER_READY_PLACEHOLDER` -- unread, its stand-in in code since the review's F2 (the room's
   lobby again clears the late state, §8).*
4. **W4 -- "[tag] name" in the info box (S, 1).** `hud.ts`: the followed body's name through "[%s] %s" when its row
   carries a tag, the name alone otherwise (`FUN_00238500` D:L85563-85567). *Test first*:
   `packages/viewer/test/hud.test.ts` (a tagged followed player, an untagged one, an empty tag). *Built 2026-10-14
   (SPECTATOR-VIEW), reading pending review: `taggedName(tag, name)` exported for NU-3b.*
5. **W5 -- the jump as the original walks it (S, 1).** `spectatorView.ts`: no alive filter, the bodies in the list's
   order (research 248 F3; `JUMP_TO_VISIBLE_READING`'s doc re-filed). *Test first*: a spectatorView test (a dead body on
   the centre segment and a living one off it: the dead one taken). *Built 2026-10-14 (SPECTATOR-VIEW), reading
   pending review.*
6. **W6 -- the scenic view's live look and zoom (M, 3).** `spectatorView.ts` and the page's camera: in scenic the look
   input turns the view from its authored start and the zoom input scales the magnification by the formula of §5.2,
   reset to 1 at entry and exit (research 248 F5; D:L140408, D:L140512-140529; the projection's use of it is the
   implementer's read of `FUN_002964f0`). *Test first*: the magnification after held input (bounds 1 and 30), the reset
   on X and on Up / Down. *2026-10-14 (SPECTATOR-VIEW), reading pending review: the module's half built and tested
   (`spectatorView.test.ts`); the page's half -- `NetPage.frame`'s dt into `SpectatorView.frame`, the host's `magnify`
   to the fly camera's projection (three's `camera.zoom`) -- touches `netPage.ts`, held for the seat's word on the
   reported hunk.* *Built the same day on the seat's word (the gameplay seat's clearance): `NetPage.frame` hands its
   real seconds, `NetPageDeps.spectateMagnify` -> `FlyCamera.setMagnification` (three's `zoom`, apart from the scopes'
   `fov`); the page has one camera for the walker and the spectator (`main.ts`, `matchMount.ts`: one `FlyCamera`, its
   `camera` rendered either way), so a spawn or a promotion puts it back at 1 (`SpectatorView.reset`, an adaptation's
   guard) and a new page's first frame tells 1 (`netPageGame.test.ts`, `camera.test.ts`).*
7. **W7 -- the docs and a pin (S, 1).** Roadmap 05's ONL-21 block: "Today" (the join from the list is built, the camera
   and HUD built by PF-31, PT-19b, PAR-48), the unknown `SPECTATOR_PAD_PLACEHOLDER` struck (retired, R314.8), the
   captions' words (§2.1); research 154 §6's departure line re-filed by W2; `gameLobbyCommands.ts`'s `JoinMPGame` doc
   cite D:L197166-197168 corrected to D:L197175-197178. A test pins `WATCH_NO_SLOT_STALE_VALVE_READING` (a watch of a
   no-slot game with the valve 0: #424; with it 8 from an earlier join, or from opening and leaving CREATE GAME: no
   request, #440 at 30 s). *Done 2026-10-14 (WATCH-DOCS), reading pending review: roadmap 05's ONL-21 "Today",
   "Gap", "Unknowns" (the pad's placeholder struck) and the captions' words; 154 §6 found re-filed by W2; the cite
   corrected; the pin green at once (`watchNoSlotValve.test.ts`, §3.1).*
8. **W8 -- the rank checked for a player only (S, 1).** `lobby.ts` `joinGame`: the rank refusal
   (`rankAdmitsGame`, `RANK_REFUSED_STATUS_PLACEHOLDER`) for join type 0 only, as `aux_join_game` asks it
   (`JoinAsSpectator == 0 AND GameRejectsRank`, P:L4571); its doc (`lobby.ts`, the `joinGame` comment) and research 261
   §10.4 ("A watcher is judged as a player is") corrected, `RANK_GATE_ON_SERVER_ADAPTATION`'s scope stated (where the
   gate runs is the adaptation; whom it judges is the original's). *Test first*: `packages/central/test/lobby.test.ts` (a
   watcher whose tier byte 7 does not admit is seated as a spectator; a player of that tier still refused
   `RANK_REFUSED_STATUS_PLACEHOLDER`; the host still not judged); `gameLobbyScreen.test.ts` if the page's join path
   carries the tier (WATCH GAME of a restricted game seats, no #441). *Built 2026-10-14 (WATCH-JOIN), reading pending
   review; the page carries no tier, so no page case.*

**Flagged, not ONL-21's**:
- **ONL-20b** (the return to the GAME LOBBY after a full game): the watcher's return is a case of its tests once it
  lands (S, then); W3 shares its file.
- **ONL-22**: the ejected spectator's `dlgNetBanned.rdr` screen (#539) and the 90 s timeouts (`dlgNetError`) for a
  watcher as for a player.
- The map viewer's `watch` (`online.ts`, `netPage.ts`): a browser instrument on the maps' rooms, not the original's
  WATCH GAME; ONL-21 leaves it.

## 8. Placeholders and readings

Proposed for ONL-21; none is in code yet, so each is *note only* until the build carries it (the ledger's rule).

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `SPECTATOR_PASSWORD_SECURITY_BIT_READING` (proposed: server `lobby.ts`) | `'4 with a non-empty spectator password, beside 1 for a game password'` | the services' security level the client tests with `& 4` for a watch (`FUN_002f8d50` D:L197495) and `& 1` for a join (D:L197521); the services' writer is not on the client's side of the wire | ONL-32's transcript of the list row of a game created with a spectator password (and with both, and with neither) | open: in code 2026-10-14 (WATCH-JOIN W1, server `lobby.ts`), reading pending review; was *note only* (proposed) |
| `WATCH_SLOTS_HOST_REFUSAL_READING` (proposed: server `lobby.ts` and `room.ts`) | `'the services bound the players and spectators together; the host refuses a watcher past its MaxSpectatorsValve, reason 2'` | `FUN_002bc620` D:L161395-161424 against the world report's MaxPlayers sum (`FUN_002ef590` D:L191354-191363); the original services' own test of a watcher against the split is unread | ONL-32's transcript of a WATCH GAME of a game whose spectator slots are full and whose players are not | open: in code 2026-10-14 (WATCH-JOIN W2, server `lobby.ts`, named in `room.ts`), reading pending review; was *note only* (proposed) |
| `LATE_WATCHER_IN_PROGRESS_READING` (proposed: ui `gameLobbyCommands.ts`) | `'a watcher of a launched game goes to the round in progress once #352 is answered'` | the late flag cleared at the level's load and the ghost flag a non-spectator's only (`FUN_001f5e70` D:L55711, D:L55715-55728); #352's words; the lobby-to-load step for a late joiner not re-read | a read of `check_loop`'s wait for a late joiner (the major state a launched game's console reads in the lobby); ONL-32's capture of a WATCH GAME of a game in progress | replaced 2026-10-14 by `READY_LOADS_LATE_JOINER_READING` (LATE-WATCH, W19.R12: the lobby-to-load step read, §4.2 -- YES waits, READY loads); was *note only* (proposed), never in code |
| `READY_LOADS_LATE_JOINER_READING` (ui `gameLobbyCommands.ts`) | `'a late seat\'s READY sets the major state 2 and loads it into the round in play; YES only waits'` | YES's wait (P:L7268-7271); READY lit for a late joiner (P:L7250-7251), `ready_anim` -> `ReadyToLoad` (P:L6644, P:L7433), `FUN_0027caf0` D:L125606-125608: the major state 2 (the argument in the delay slot at 0x0027cb24) and the minor 1, nothing sent; `check_loop` P:L7116, P:L7126; no team test; the level's clear and the ghost flag (`FUN_001f5e70` D:L55715-55716, D:L55725-55727) | ONL-32's capture of a WATCH GAME into a game in progress (and a late JOIN GAME): YES, then READY, the load, the round in progress | open: in code 2026-10-14 (LATE-WATCH), reading pending review |
| `LATE_SEAT_NEVER_READY_PLACEHOLDER` (ui `gameLobbyCommands.ts`) | `'a late seat waits for its READY; the room\'s lobby again clears the late state'` | what carries a late seat that answers YES and never presses READY -- the host's told game state's changes (`FUN_002c3cf0` D:L165355-165410: state 2 takes a spectator at major 1 to 2 with no READY) and the clear of the late flag on the network's message 4 (`FUN_002bbfa0` D:L160943-160947, dispatched by `FUN_0030d7d0` D:L210147-210151; what the message is, unread) -- with the host's states mid-round and that message unread. The port's stand-in: such a seat stays in the lobby with the late state until its READY (the late branch then loads it); the room's view of the game no longer launched (its lobby again) clears the late state -- `late_joiner` 0, the page's own flag -- so its READY is then the normal ready (`lobbyReady`) and the next launch hands it off with the others, as no late joiner; on the lobby's return the stand-in also restores Switch Teams, Ready, Armory and exit availability (ui `gameLobbyCommands.ts` ~1217/1241; the cancelled-countdown half is LSR.R1) | a read of the host's game states through a round (`FUN_002a7490`'s callers, D:L55633, D:L127391, D:L128124) and of `FUN_002bbfa0`'s message 4; ONL-32's capture of a late watcher left in the lobby across a round's end and across the game's return to its lobby (a capture of the original would also settle the restored controls) | open: in code 2026-10-14 (LATE-WATCH's review F2, the port's stand-in; ui `gameLobbyScreen.test.ts`'s F2 case), pending review; was *note only* (proposed, "stays in the lobby") |
| `WATCH_NO_SLOT_STALE_VALVE_READING` (proposed: ui, a test's pin; the port already transcribes the order) | `'#424 only when MaxSpectatorsValve already reads 0; else no request and #440 at 30 s'` | `JoinMPGame`'s early return (D:L197175-197178) before its copy of byte 4 into the global `MaxSpectatorsValve` (D:L197206-197218), read by `aux_join_game` (P:L4619) and its wait (P:L4629-4632, P:L4708-4710); CREATE GAME's opening also writes it 8 online (`init_cg_screen` P:L5797, P:L5821-5825, with `CreateGameSettingsChanged` 0 from every join, P:L4617) | ONL-32's transcript of a WATCH GAME of a no-spectator game right after a session's join of a game with spectators, and again after opening and leaving CREATE GAME | *note only* -- no constant: pinned 2026-10-14 by ui `watchNoSlotValve.test.ts` (WATCH-DOCS; the port's order already transcribed, green at once), reading pending review; was *note only* (proposed) |
| `WATCHER_READY_PRESS_READING` (proposed: server `gameLobby.ts`, beside `READY_SEATS_READING`) | `'refused: the watcher\'s own toggle undone by the next view'` | the original leaves a spectator's READY live after `ClientDAReadyButton`'s 10 s count (`SetupNormalJoiner`, P:L7283-7285, P:L7831-7856) and toggles the console's own record (`FUN_002c3fc0`, 165 R165.6), never counted (`FUN_002c40c0`); whether the toggle stays and reaches the others is unread | a read of `FUN_002c3fc0` and the record it writes for a 0x10000 seat; ONL-32's capture of a spectator pressing READY in a GAME LOBBY | *note only* (proposed) |
| `SPECTATOR_PAD_PLACEHOLDER` | -- | the buttons behind bytes +5, +6, +7, +10 | -- | retired 2026-10-06 (PF-31, research 101 §5; R314.8) |
| `FOLLOW_OFF_DEAD_READING` (retired 2026-10-16, AD-8; was viewer `spectatorView.ts`; 2026-10-14, the SPECTATOR-VIEW review's N1) | `'the first living body in seat order'` | what the follow camera does when its body is dead or gone: the port binds the cycle's next from a body no longer a candidate, the first living body in seat order (`nextFollow`); since W5 a jump onto a corpse follows it one frame. The original's target death and departure are open (research 248 §5) | a read of the follow camera's death call chain (`FUN_00297410` / `FUN_00296f10` with a dead target, and who rebinds), or ONL-32's capture of a followed player dying and of a jump onto a corpse | open: in code 2026-10-14, reading pending review; retired 2026-10-16 (AD-8, §5.4): the original keeps the dead body bound and, for a spectator, rebinds to no killer or saved actor; `follow` keeps the dead body, the name gone from the code (its successors the three `FOLLOW_*` rows below) |
| `SCENIC_LOOK_AXES_READING` (viewer `spectatorView.ts`; 2026-10-14, SPECTATOR-VIEW W6) | `{ zoom: 'moveY', yaw: '-lookX', pitch: 'lookY' }` | the pad's processed channels `FUN_002964f0` reads for a scenic view -- +0x224 the zoom (D:L140408), +0x228 / +0x22c the yaw and the pitch (D:L140414-140415) -- as the left stick's y and the right stick's x and y, up and left positive (D:L179557-179563, D:L179808-179811; research 116 §7), mapped onto the page's `Input` in the port's yaw convention (`SCENIC_VIEWS_READING`); the pitch step x `DAT_003df198`, INVERT PITCH's sign (D:L140426; flipped by the START menu D:L61699-61721, set by the stored option D:L125167-125171), from the camera's `LookOptions.invertPitch` (*2026-10-14, the review's B1: was read as the constant 1.0*); the processed range is the page's (research 184's 0.3 dead zone and radial step not ported); not ported with it: the bounds pass after the zoom (D:L140531-140593) and the LOD scale (D:L140528, `LOD_SCALE_READING`) | ONL-32's capture of a scenic view turned and zoomed with each stick (the picture's turn and magnification against the pad's) | open: in code 2026-10-14, reading pending review |
| `GHOST_OWN_PLACE_READING` (proposed: viewer, the match's mount; 2026-10-15, NU-11) | `'the match's opening stand'` | where a ghost's own view stands before its first cycle: the original's ghost actor is placed at a spawn slot of its side by its seat (`FUN_002b7d60` D:L158619-158624 -> `FUN_002b8100` D:L158758-158763) and made unseen (`FUN_00543d50`); the port's walker stands at the opening stand (`matchMount.ts` `standOf`) for every seat, the room placing no ghost (a seat demoted for idling and later promoted as a ghost: where its walker last stood, LATER 90's review F1) | ONL-32's capture of a late JOIN GAME: the ghost's first view (its slot's) before any cycle | *note only* (proposed) |
| `GHOST_DEATH_CAMERA_READING` (viewer `netPage.ts`, named in `seatGhost`'s doc; 2026-10-16, NU-11b F1) | `'the death camera, mode 6'` | the ghost's view before its first cycle: its walker made dead from its seat (`WalkMode.setDead`, §4.3) takes the walk's death camera -- the camera's death mode for the player's actor in state 8 (`FUN_00297410` D:L140893-140913), the ghost's actor in state 8 (`FUN_00543d50` D:L410437) -- in mode 6, no killer named; mode 3 needs a killer at the actor's `+0xfc4` (`FUN_002980d0` D:L141355-141375), not read for a fresh ghost actor | a read of `+0xfc4` on the actor `FUN_002b7d60` spawns (D:L158609-158650); ONL-32's capture of a late JOIN GAME: the ghost's first view before any cycle | open: in code 2026-10-16 (NU-11b F1), reading pending review |
| `FOLLOW_RETIRED_BODY_PLACEHOLDER` (viewer `spectatorView.ts`; 2026-10-16, AD-8) | `'the last body the page saw, not alive, kept'` | the followed leaver between its departure and its deletion: the original retires the actor -- health 0, team mask 0, the retired identity, state 8 (`FUN_005998b0` D:L455516-455525, under `FUN_002bef60`'s guards D:L162520-162537) -- and leaves it in the actor list where the camera keeps it (§5.4 item 2); the port's room drops a leaver's body from its next snapshot (`left`), so the page has no retired body and keeps the last one it saw, made not alive; where the retired actor stands and whether it is drawn is unread ; a second user (DEAD-WATCH, 2026-10-17, research 314 §5.6): the benched dead player's or ghost's teammate view (`followWatched`), whose watched teammate leaves -- the original keeps that retired actor bound as it does a spectator's (§5.4 item 2; the death camera at 7 binds no one online, §5.6 item 3); the port's view, with no retired body, hands no pose from the departure, so the camera stays where the last pose stood it and moves with the sticks | ONL-32's capture of a spectator following a player who leaves the game (the picture until the body goes), and of a dead player watching a teammate who leaves -- one capture settles both users | open: in code 2026-10-16 (AD-8), reading pending review; was *note only* (proposed) |
| `FOLLOW_DELETE_QUEUE_PLACEHOLDER` (viewer `spectatorView.ts`; 2026-10-16, AD-8) | `'queued at the departure; one deleted a frame'` | when a retired leaver's removal is queued and how often the queue runs: `FUN_0029f510` deletes one pending entry a run (D:L145118-145123) and then runs every listed actor's slot +0x14 (D:L145122-145123) -- likely the actor list's per-frame tick -- registered at D:L50922 among a run of registrations whose first arguments climb 0.8 / 0.9 / 1.0 / 3.0 / 4.5 (D:L50920-50924) -- likelier an ordering than a period; its rate is unread; the queue's writers are the body's clean-up after a timer (`FUN_0056ee80` D:L432650-432688) and a message's handler (`FUN_005dd990` D:L493130-493142), the retirement none (§5.4 item 3); the port queues a leaver at its body's absence and deletes one a frame | a read of `FUN_0034e6b0`'s scheduling and of `FUN_0056ee80`'s timer for a retired actor; ONL-32's trace of two players leaving at once | open: in code 2026-10-16 (AD-8), reading pending review; was *note only* (proposed) |
| `FOLLOW_AFTER_DELETE_PLACEHOLDER` (viewer `spectatorView.ts`; 2026-10-16, AD-8) | `'the camera left where it stands'` | what a spectator's camera follows once its actor is deleted: `FUN_0029f850` (D:L145217-145247) writes no camera's +0xbc / +0xc0 / +0x10c, and whether the camera is notified (an entry of the list, or slot +0x54) is unread (§5.4 item 3.4); the port invents no replacement: the view hands no pose and keeps the mode and the target, so the page shows the HUD's follow box with the departed player's name and no stats (`hud.ts` `follow` arm; names outlive a `left`, `netPage.ts` :1429), and the fly camera, given no pose, moves with the sticks while the mode still reads follow (AD-8's review, F3); a second user (DEAD-WATCH, 2026-10-17, research 314 §5.6): the benched teammate view (`followWatched`), which hands no pose from the departure on (`FOLLOW_RETIRED_BODY_PLACEHOLDER`'s second user) and so past the deletion too, watching kept until a cycle | a read of the camera's membership of the actor list and its slot +0x54; ONL-32's trace of camera +0xbc / +0xc0 / +0x10c across a followed actor's deletion | open: in code 2026-10-16 (AD-8), reading pending review; was *note only* (proposed) |
| `SPECTATOR_TURNOVER_EVENT_READING` (viewer `spectatorView.ts`; 2026-10-17, AD-9) | `'roundStart'` (the next round's start) | the event at which a spectator's mode, remembered mode, followed actor, scenic index and magnification are reset to free / free / none / -1 / 1 (`FUN_00299150` D:L141664-141671): online, the MP exit state's tick on game state 3 or 5 -- the respawns, then the restart's reset (`FUN_00223680` D:L75920-75938, `FUN_002a7d40` D:L149685) -- and its UnInit's second reset at the pop (`FUN_002232a0` D:L75869); the host's 5 from ROUND COMPLETE's `ReplayMission` (D:L127390-127392), a client's on the host's game object; not a death, a bind or the match's end (§5.5 item 2). The port has no MP exit state: its page leaves the round screen at the room's `roundStart`, which stands for that tick | ONL-32's trace of camera +0xf4 / +0xf5 / +0x10c / +0x110 / +0x118 and the projection across a round's turnover with a spectator in follow and in scenic zoomed (the first frame of the next round against the last of the round screen) | open: in code 2026-10-17 (AD-9 step 2: `SpectatorView.reset`, the page's unbench at `roundStart`), reading pending review; was *note only* (proposed) |
| `SPECTATOR_TURNOVER_POSE_PLACEHOLDER` (viewer `spectatorView.ts`; 2026-10-17, AD-9) | `'the fly camera where it stands'` | where a spectator's camera stands after a turnover: the reset leaves the bound object (+0xbc / +0xc0); the turnover's respawn loop attaches the camera to the console's own actor (`FUN_00598b90` D:L75925-75933 -> `FUN_00599b60` D:L455697-455701 -> `FUN_0029b3c0` D:L142748-142781) only if a spectator's actor is a type-2, unretired entry of the list (D:L75927-75930, unread for a spectator's actor) -- then free on its own object, placed as at its entry (`SPECTATOR_ENTRY_POSE_PLACEHOLDER`); if not, the camera keeps orbiting the actor it followed (+0x139 2, `FUN_0029b330` D:L142720-142725) while the pad's mode reads free (§5.5 item 3). The port's stand-in: no pose handed, the page's fly camera where it was | a read of the list entry a spectator's actor is (its +0x10 at `FUN_002b7d60`'s spawn, D:L158609-158650, and `FUN_00543d50`); ONL-32's capture of a spectator following a player across a round's turnover (the first frame's place) | open: in code 2026-10-17 (AD-9 step 2: the reset hands no pose), pending review; was *note only* (proposed) |
| `SPECTATOR_OWN_SLOT_PLACEHOLDER` (viewer `spectatorView.ts`; 2026-10-17, DEAD-CYCLE) | `'before every player'` | where a spectator's Right / Left walk starts in free and scenic: at its own object's slot (the camera's +0xbc, `FUN_0029f180` D:L412584, D:L412637; X from follow and Up / Down onto a view bind the own object, D:L139501-139504, D:L139552-139555, D:L139580-139583), a slot the walk never takes (a spectator, D:L412601-412603) and whose place among the players' is unread; the port starts from before every player -- Right the first living body in id order, Left the last (a slot after every player gives the same) (§5.6 W5) | a read of the spectator object's list entry (`FUN_002b7d60` D:L158609-158650); ONL-32's capture of a spectator's Right and Left from free with players on both sides of its join | open: in code 2026-10-17 (DEAD-CYCLE), reading pending review |
| `DEAD_CYCLE_OWN_VIEW_READING` (viewer `spectatorView.ts`; 2026-10-17, DEAD-CYCLE) | `'the death camera as before the cycle'` | the own body's view when a dead player's cycle comes back to it: the original keeps the death camera at 7, set every frame a remote teammate was bound (`FUN_002980d0` D:L141378-141389) and written back only by the initialiser (`FUN_00299150` D:L141657) -- the orbit about the own body turned by the stick (`FUN_00297a30` D:L141219-141221), not the 3 or 6 the death began in; the port's death camera has no state 7 (`deathCamera.ts`), so the own view comes back as before the cycle through `SpectatorHost.returnSelf` (the page's `WalkMode.resumeBody`) (§5.6 W6) | state 7 ported; ONL-32's capture of a dead player cycling back to his body (the stick turning the view about it) | open: in code 2026-10-17 (DEAD-CYCLE), reading pending review |

The names this note leans on are each listed, retired or *note only*, where they live: `SPECTATOR_PASSWORD_READING`
(research 154 §9), `LATE_JOINER_NEXT_ROUND_READING` (research 165 §6), `READY_SEATS_READING` (server `gameLobby.ts`),
`VOICE_SPECTATOR_CHANNEL_READING` and `VOICE_GHOST_FLAG_READING` (research 225), `JUMP_TO_VISIBLE_READING`,
`SPECTATOR_CYCLE_ORDER_READING`, `SPECTATOR_START_READING`, `SPECTATOR_HOSTAGE_READING` and
`SPECTATOR_ENTRY_POSE_PLACEHOLDER` (research 101's PF-31 block), `ABANDON_TRIGGER_READING` (server `bridge.ts`),
`CLAN_CLOSED_WATCH_READING` (research 308 §8, note only there), `CLAN_TAG_AT_SEAT_READING` (research 275), `RANK_REFUSED_STATUS_PLACEHOLDER`
and `RANK_GATE_ON_SERVER_ADAPTATION` (research 261 §6; W8 narrows whom the gate judges, not its status or place).

## 9. What is left

- **Captions to dump** (`tools/dump-online-dialogs.ts --dialog dlgMPBriefingRoom.rdr`; `tools/dump-dialogs.ts
  --msg-users 417 419`): the reader's confirmation of §2.1's texts, #527's (the shared-string reading), and who uses
  #417 and #419 (the LAN BRIEFING ROOM, if any).
- **Not read here**: what moves a late joiner's console from the lobby to the load (§4.2) -- *read 2026-10-14
  (LATE-WATCH): READY, `ReadyToLoad`'s late branch; what carries a late seat that never presses READY stays open
  (`LATE_SEAT_NEVER_READY_PLACEHOLDER`)*; `FUN_002c3fc0` for a
  spectator's record (`WATCHER_READY_PRESS_READING`); the original services' JoinGame test of a watcher against the
  spectator slots (`WATCH_SLOTS_HOST_REFUSAL_READING`); the Game Signal's time field for side 3 (D:L161428-161439, the
  host's timer or `FUN_002a6ad0`) and what the joiner does with it; research 248's F4 and F6.
- **The followed player's death, departure and deletion (§5.4)**: ONL-32's death / retire / delete event trace -- the
  first visible frame after a followed player dies, leaves and is deleted (camera +0xbc / +0xc0 / +0x10c and the
  submitted matrices across frames); `FUN_0034e6b0`'s period for `FUN_0029f510`; the dead arm's turn
  (D:L140915-140918) against the spectator's `FUN_00294b40` stand (D:L140957-140960), not built.
- **The turnover (§5.5)**: ONL-32's trace across a round's turnover with a spectator in follow and in scenic zoomed
  (`SPECTATOR_TURNOVER_EVENT_READING`, `SPECTATOR_TURNOVER_POSE_PLACEHOLDER`); not read here: `FUN_0029fcb0` and
  `FUN_003aa9d0` (D:L75924, D:L75934), the turnover's virtual calls, and the list entry a spectator's actor is.
- **The late joiner's ghost (§4.3)**: ONL-32's capture of a late JOIN GAME on two consoles -- the ghost unseen on both,
  its first view, Right / Left among its living teammates, none of the spectator's camera, a player at the next round.
- **The proven level**: ONL-32's spectator capture -- WATCH GAME from the list (with and without a spectator password),
  #424 and #440 (after a join, after opening CREATE GAME), "Too many spectators", a watch of another tier's restricted
  game (admitted), the GAME LOBBY's SPECTATORS column with the ARMORY disabled, SWITCH TEAMS lit (and its press doing
  nothing) and READY's 10 s count, #352 into a game in
  progress (YES waiting, READY loading into the round in progress; the late player's ghost alike), the camera's modes and help lines against `spectatorView.ts` and research 282, the return after a full game
  (with ONL-20b).
