# 163 -- CREATE GAME: the rows, a private game, respawn refused, and the create (ONL-13)

Written 2026-10-05 for ONL-13 (`../roadmap/05-online-front-end.md` "ONL-13"), wave 4 of sprints 16 and 17 on the
online path's plan (`../plans/2026-10-02-online-path-target.md`, OT.R16, OT.R21, OT.R27, OT.R32 H90, OT.R35; the waves
table's `create` row). CREATE GAME and its PLAY LIST are **one dialog**, `dlgCreateGame.rdr`: the PLAY LIST is the
dialog's own popup (`pop_missionBack` and its two lists). The waves table gives them two notes, so this one holds the
screen and the create and [164](164-the-play-list.md) holds the map popup (ONL-14). Sources: the retail decompilation
`socom2_game.elf.decomp.c` under `SOCOM_PC_ROOT` (`D:L<n>` its line, `FUN_<addr>` its functions; cited, never pasted);
the retail ELF read by address (`S:0x...` its strings); the disc's `dlgCreateGame.rdr` layout and set through the
repository's readers (`tools/dump-online-dialogs.ts --dialog dlgCreateGame.rdr`, ONL-33's pin
`tools/test/onlineDialogs.pinned.json`), `global_valves.rdr` and the UIMnLOC table; SVC-06's service as built
(`packages/central/src/lobby.ts`, research 154, 159). **No server was contacted** (R293); no game was run; no browser was
run (the host was another session's). It stands on research 154 (CreateGame1's fields, R154.6, R154.7), 159 §3.3-§3.4 (the
`$~<room>` name, the respawn refusal), 203 §1-§2 (the research wave's create-game ranges and `mp_persistent`; reading,
pending review there, re-read here at the set), 157 §6 (the ticket and the session lost) and 161 §3 (the room list's
transport, the pattern this one follows), and does not restate them.

The code: `packages/ui/src/screens/createGameCommands.ts` (`SetMission`, `CreateMPGame`, CreateGame1's request, cbCreateGame's
events, the hand-off, `mountCreateGame`, `openCreateGame`), `packages/viewer/src/createGameHost.ts` (`fetchCreateGameService`,
`sessionCreateGame`, `missionsFromReaderc`). The tests: `packages/ui/test/screens/createGameScreen.test.ts` over
`createGameRig.ts` (the disc's own record: the defaults, each row's cycle and wrap, the private game, RESPAWN, the create
and its three answers, the return; CI on the fixtures), `createGameCommands.test.ts` (the rows off the machine),
`packages/viewer/test/createGameHost.test.ts` (the bearer, the 401, the refusals, no ticket). Confidence: **reading,
pending review** for every transcription; nothing is measured against the original running (§7).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R163.1 | **Every row's range is its set's**: PLAYERS `incr_num_players` +2 from 2 to 16, 16 wrapping to 2; ROUND TIME `SetRT_valve` 4..10 minutes, 10 wrapping to 4, `mp_max_round_time` the minutes x 60 (#273-#279); ROUND COUNT `SetNR_valve` 3, 5, 7, 9, 11, 11 wrapping to 3; FRIENDLY FIRE `set_FF_valve` 0 / 1 (#257 / #258); EQUIPMENT 0..4 (#260, #244, #261, #262, #263); SPECTATORS 8 / 0 online | the set; `createGameScreen.test.ts` | §1 |
| R163.2 | **The first arrival** (`init_cg_screen`, `CreateGameSettingsChanged` 0): 16 players, 6 minutes, 11 rounds, no password, respawn 0, spectators 8, rank restrictions = `room_rank_bits`, clan 0; **friendly fire is not set there** -- it shows `global_valves.rdr`'s `mp_friendly_fire` 0, "Friendly Fire is disabled.", and RESTORE DEFAULTS (`SetDefaultStatus`) makes it 1. Research 203 §1's "default 1" is RESTORE DEFAULTS', not the first arrival's. TRIANGLE (`create_game_exit`) saves every valve to `*_saved` and a later arrival restores them | the set; `global_valves.rdr` | §1 |
| R163.3 | **A private game**: SET PASSWORD (`toggle_password`) opens the soft keyboard on PlayerGamePassword; a non-empty text turns `PasswordValve` on, the row's caption to CREATE PASSWORD (`_307_`) and its value to YES; CROSS again clears it. CreateGame1 carries the password only with `PasswordValve` on, and empties the variable otherwise (`FUN_002edda0` D:L190534-190541) | the set; D:L190520-190578 | §2 |
| R163.4 | **RESPAWN is drawn and not selectable (OT.R21)**: the original never shows respawn unavailable online; its way with a row that cannot be taken on this screen is `DisableButton` (CLAN OPTIONS for a player in no clan, ROUND TIME and ROUND COUNT under respawn), drawn in the layout's `DISABLED` look (text 50 50 50) and passed by the ring. `SetMission`, `init_cg_screen`'s first statement, disables RESPAWN on every arrival | `RESPAWN_ROW_DISABLED_READING` | §3 |
| R163.5 | **CREATE** (SQUARE, `create_game`): no play list #303; no name (after `PruneUIVarSpaces`) #304; else `CreateMPGame` -- 0x27d7d0 -> `FUN_002f9410` (D:L197720-197780): GAMENAMEVAR becomes "<name>$~<MEDIUS_LOBBY_NAME>" (S:0x3f5af8), `mp_persistent` 0, `mp_game_sort_order` 127, state 13 queued, whose entry sends CreateGame1 (`FUN_002edda0`) | §4's table | §4 |
| R163.6 | **The answers** (cbCreateGame `FUN_002ee090` D:L190588-190645): -975 MP_GAME_NAME_EXISTS -> `game_name_exists`: #294, CONTINUE, the name cleared, the focus on GAME NAME, the screen kept; any other failure MP_MEDIUS_JOIN_GAME_FAILURE -> `create_game_failure`: #295 "Create Game Failed! ¦ Return to Briefing Room." and `SWITCHMENU(PREVIOUS_SCREEN)`. Our server's -966 (a map not offered, respawn asked, a field) and -945 (the room full) are the second | D:L190605-190614 | §4 |
| R163.7 | **A success** keeps the world id and queues the join (state 15); the screen waits for state 17, then connects, joins and switches to `dlgGameLobby.rdr` -- ONL-16a's. Until it is built the created game is handed to the mount's `created` and the screen returns to its caller | `GAME_LOBBY_GATE_READING` | §5 |
| R163.8 | **The transport (OT.R27)**: the page posts CreateGame1's fields to SVC-06's `/lobby/create-game` at its own origin with `Authorization: Bearer <ticket>`; a 401 is the session lost (`LobbyClient.sessionLost`: MP_MEDIUS_ERROR, this dialog's `OnMultiplayerDisconnect`); any other refusal is a Fail, so #295; with no ticket no request | `CREATE_GAME_HTTP_ADAPTATION` | §6 |
| R163.9 | **The entry**: the briefing room reaches CREATE GAME by its own script (`OnCreateGamePress`: `.DINK`, `SWITCHMENU(dlgCreateGame.rdr)`), so ONL-12 needs only `mountCreateGame(host, ...)` on the session and its gate line removed; `openCreateGame(host)` runs the same switch for a stand-in caller. The way back is the dialog's `SWITCHMENU(PREVIOUS_SCREEN)` | `createGameCommands.ts` | §6 |

## 1. The rows (R163.1, R163.2)

The layout has thirteen rows (BUTTONs at x 16, y 83 + 25k): GAME NAME #227, SET PASSWORD #228, PLAYERS #229, ROUND COUNT
#230, ROUND TIME #231, FRIENDLY FIRE #232, EQUIPMENT #233, SPECTATORS #234, RESTORE DEFAULTS #235, RESPAWN #236, RANK
RESTRICTIONS #237, CLAN OPTIONS #238, CHOOSE GAMES #239; each value a TEXT at x 185 on its brown band. Each row's
ONACTIVATE writes its help line into DescriptionText (#254, #286, #289, #291, #292, #290, #284, #282, #280, #285, #287, #255,
#281). Every CROSS but GAME NAME's and CHOOSE GAMES' sets `CustomGameSettings` 1 and DefaultStatusText to "Custom" (#248).

| row | animation | values (the set) | caption |
|---|---|---|---|
| PLAYERS | `incr_num_players` | `MaxPlayersValve` += 2; past 16, 2 | `NumPlayCountVal` the number (`refresh_cg_screen`) |
| ROUND COUNT | `SetNR_valve` | 3 -> 5 -> 7 -> 9 -> 11 -> 3 | the number; `mp_max_rounds` the same |
| ROUND TIME | `SetRT_valve` | 4 -> 5 -> ... -> 10 -> 4 | #273-#279 ("4 minutes" .. "10 minutes"); `mp_max_round_time` 240..600 |
| FRIENDLY FIRE | `set_FF_valve` | `mp_friendly_fire` 0 <-> 1 | #257 "Friendly Fire is disabled." / #258 "... enabled." |
| EQUIPMENT | `SetEQ_limit_valve` | `EQlimit` 0 -> 1 -> 2 -> 3 -> 4 -> 0 | #260 No limitations, #244 Pistols only, #261 Shotguns only, #262 Snipers only, #263 No Bombs |
| SPECTATORS | `SpectatorSet` | `MaxSpectatorsValve` 8 -> 0; 0 -> 8 and the keyboard on SpectatorGamePassword (`set_spec_password`) | #253 YES / #246 NO |
| RESTORE DEFAULTS | `SetDefaultStatus` | 16 players, 6 minutes, 11 rounds, respawn 0, rank = `room_rank_bits`, clan 0, **friendly fire 1**, EQlimit 0, no password, spectators 8, the play list cleared | #245 Default |
| RESPAWN | `set_respawn_valve` | not reached (§3) | #250 "Respawn is disabled." |
| RANK RESTRICTIONS | `incr_rank_restriction` | `mp_rank_restrictions` through `find_next_rank_restriction` within `room_rank_bits` | the four medals shown or hidden |
| CLAN OPTIONS | `FiddleClanAffiliation` | `CreateClanAffiliation` 0..4 | #264, #265, #267, #269, #271 |

The ranges agree with research 203 §1 (the research wave), now held by the rig against the disc's set. ROUND TIME's
20 minutes and ROUND COUNT's 1 are respawn's only (`set_respawn_valve`), never cycled.

**The first arrival.** `init_cg_screen` with `CreateGameSettingsChanged` 0 sets the valves above but not
`mp_friendly_fire`, so the row shows that valve as it stands: `global_valves.rdr` declares it 0 (as it does
`MaxPlayersValve`, `MaxSpectatorsValve`, `EQlimit`, `PasswordValve`, `mp_rank_restrictions`, `room_rank_bits`,
`mp_persistent`, `mp_game_sort_order`), and nothing on the path writes it before this screen, so the first arrival reads
"Friendly Fire is disabled."; RESTORE DEFAULTS turns it on. The rig shows it so (the page seeds no `global_valves.rdr` yet:
an absent valve reads 0, the same value; OPT-02's).

**The return.** `create_game_exit` (TRIANGLE) copies eleven valves to their `*_saved` twins, sets
`CreateGameSettingsChanged` 1 and, unless `CreateGameGuardValve` is set (a create in flight), `SWITCHMENU(PREVIOUS_SCREEN)`;
the next arrival restores them (`mp_rank_restrictions` OR the room's bits). The briefing room's `join_game` clears
`CreateGameSettingsChanged` (`dlgMPBriefingRoom.rdr`'s set).

## 2. GAME NAME and a private game (R163.3)

GAME NAME's CROSS (`set_game_name`): `GetTextInput(GAMENAMEVAR)` -- PLAT-17's soft keyboard -- waits on `skb_done`, then
`NetCensorText(GAMENAMEVAR)` (ONL-06's row, `NET_CENSOR_TEXT_PLACEHOLDER`: every text passes). `GameNameAct`, run at
ONSTART and on the row's ONACTIVATE, sets `mp_persistent` 1 (research 203 §2); `CreateMPGame` sets it 0 again.

SET PASSWORD's CROSS (`toggle_password`) clears PlayerGamePassword; with `PasswordValve` 1 it turns the game public
(caption PASSWORD `_251_`, value NO, `password_val` hidden); with 0 it opens the keyboard on PlayerGamePassword and, if the
text is not empty, sets `PasswordValve` 1, shows `password_val` (a SECURETEXT: the page masks it, `FUN_0036aff0`), the
caption CREATE PASSWORD (`_307_`) and YES. `FUN_002edda0` (D:L190520-190578) sends the password only with `PasswordValve`
on and otherwise sets the variable to "" (S:0x3f48d0); the spectator password likewise with `MaxSpectatorsValve` not 0.
SVC-06 makes the game's security level PlayerPassword for a non-empty password (`lobby.ts`), which the briefing room's PASS
column reads.

## 3. RESPAWN refused (R163.4, OT.R21)

**Superseded by OT.R71 (the owner, 2026-10-22; #421 finished by the online seat, the plan
`plans/2026-10-21-respawn-fixes.md`).** Respawn is a match option on every server that hosts games: `init_cg_screen`
leaves RESPAWN as the original draws it (nothing below disables it but OT.R21's adaptation), the server takes a create
or a report with RulesSet bit 1, and the valve starts 0 as the first arrival and RESTORE DEFAULTS set it (R163.2) --
respawn off by default. `RESPAWN_ROW_DISABLED_READING` now applies only where respawn is not offered
(`createGameCommands.ts` `respawnRules` false, a test's). What follows is the reading as it stood under OT.R21.

On the console RESPAWN toggles `mp_allow_respawn`: on, it saves and forces 20 minutes and one round, disables ROUND TIME
and ROUND COUNT (`refresh_cg_screen`), cuts the play list to SUPPRESSION maps (`RemoveNonSuppressionMaps`, `FUN_002791e0`
D:L123752-123820) and shows #249. The host's world report carries it as RulesSet bit 1 (research 159 §3.4); CreateGame1
never does (RulesSet 0, D:L190575).

The original has no online state where respawn cannot be chosen, so there is no look of its own for it. The screen's own
answer to "this row cannot be taken" is `DisableButton`: `init_cg_screen` disables CLAN OPTIONS for a player in no clan
(`IsMemberOfClan` 0; ONL-09's stub until ONL-27's GetMyClans, research 272 §3) and `refresh_cg_screen` disables ROUND TIME and ROUND COUNT under respawn; the LAN
path *hides* CLAN OPTIONS and RANK RESTRICTIONS instead, which would not draw the row. RESPAWN's layout has a `DISABLED`
state (brown_back.tif, text 50 50 50). **The reading**: `SetMission(NONE)`, the first statement of `init_cg_screen` on
every arrival, is followed by `DisableButton(Respawn)` through the host's own row; nothing in the set enables RESPAWN
again (`enable_cg_buttons` names other rows), so it stays drawn in its disabled look, the ring passes it (UP from RANK
RESTRICTIONS lands on RESTORE DEFAULTS) and its help line #285 is never shown. `mp_allow_respawn` stays 0, the play list
keeps every map the first release offers, and the server refuses a create or a report asking for respawn
(`RESPAWN_REFUSED_STATUS_PLACEHOLDER`, -966, so #295).

## 4. CREATE and its answers (R163.5, R163.6)

`create_game` (SQUARE): `ScaleProgress`, the CREATING strip (`Join_flash`, letter by letter), `.DINK`; `TestUIVar(PLAYLISTVAR)`
false -> #303 "You must create a playlist before game creation can occur." and stop; `PruneUIVarSpaces(GAMENAMEVAR)`,
`TestUIVar(GAMENAMEVAR)` false -> #304 "You must enter a valid game name ..."; else `CreateGameGuardValve` 1 and `IF
CreateMPGame(NA)`, then `WHILE socom_online_state != 17` (§5).

`CreateMPGame` is row 0x27d7d0: with the LAN lobby down (`FUN_003045b0(0x44fe10)`) it calls `FUN_002f9410(0x44f370)`
(D:L197720-197780): nothing and 0 unless the lobby's flag +0x7d is set and its state +0x60 is 11; the game name
(GAMENAMEVAR, lobby +0xc4, added by `FUN_002e0450` D:L182781-182782) followed by "$~" and the room's name (MEDIUS_LOBBY_NAME,
lobby +0xc0) written back into GAMENAMEVAR; the room found by that name among the client's rooms (`FUN_002e4470`) and the
full name looked up (`FUN_002e4570`); if both pass, `mp_persistent` 0, `mp_game_sort_order` 0x7f (both through the
watchers), state 13 (`FUN_002efe20(.., 0xd)`) and 1; else MP_GAME_NAME_EXISTS (S:0x3f5b00) and 0
(`CREATE_LOCAL_CHECKS_READING`: here the room is the caller's world id and the name's look-up is the server's -975, the same
event). State 13's entry is `FUN_002edda0(1)` (`CREATE_GAME_STATE_ADAPTATION`: sent in the row's call):

| field (CreateGame1, 0xd0) | value | source |
|---|---|---|
| applicationId +0x28 | 0x28e8 | D:L190560 |
| minPlayers +0x2c | 2 | D:L190562 |
| maxPlayers +0x30 | `MaxPlayersValve` (8 if absent) + `MaxSpectatorsValve` when not 0 | D:L190528-190529, D:L190542-190553, D:L190563 |
| gameLevel +0x34 | 0 (the map comes with the report: research 154 R154.7) | D:L190561 |
| gameName +0x38:64 | GAMENAMEVAR ("testgame", S:0x3f48c0, if it is not a string) | D:L190525, D:L190531-190533 |
| gamePassword +0x78:32 | PlayerGamePassword with `PasswordValve` on, else "" | D:L190527, D:L190534-190541 |
| spectatorPassword +0x98:32 | SpectatorGamePassword with spectators on, else "" | D:L190545-190553 |
| playerSkillLevel +0xb8, rulesSet +0xbc | 0, 0 | D:L190574-190575 |
| genericField1 +0xc0 | the room's world id (`DAT_0066a538`) | D:L190576 |
| genericField2 +0xc4 | 65000 | D:L190573 |
| genericField3 +0xc8 | `FUN_002e99f0()` after `FUN_002e9840(CreateClanAffiliation)`: 0 with no affiliation; else 0xa..0xd << 28 over the clan id | D:L190555-190557, D:L190577; D:L188174-188282 |
| gameHostType +0xcc | 0 | D:L190578 |

**The answers** (cbCreateGame `FUN_002ee090`): status 0 (`FUN_002f42d0` "CreateGame", S:0x3f4938) keeps the world id
(+0x1c into `DAT_0066a5f0`) and queues state 15 (D:L190637-190641). A failure with `mp_persistent` 0 posts
MP_GAME_NAME_EXISTS (S:0x3f4960) for -975 (`-0x3cf`), MP_MEDIUS_JOIN_GAME_FAILURE (S:0x3f48a0) for anything else, and
queues state 11 (D:L190605-190616). With `mp_persistent` not 0 it would ask FindGameByName and join (D:L190618-190635);
`CreateMPGame` has just cleared it, so that branch is not reached from this screen. The dialog binds the two events:

- MP_GAME_NAME_EXISTS -> `game_name_exists`: STOP `create_game`, the CREATING strip stopped, #294 "The game you selected is
  already in use. Please try another game name and try again. ¦ CONTINUE." (#226), then `CreateGameGuardValve` 0,
  GAMENAMEVAR cleared, the focus on GAME NAME and `enable_cg_buttons`: the screen stays.
- MP_MEDIUS_JOIN_GAME_FAILURE -> `create_game_failure`: STOP `create_game`, #295 "Create Game Failed! ¦ Return to Briefing
  Room." (#226), then `SWITCHMENU(PREVIOUS_SCREEN)`: back to the briefing room.

Our server's refusals land on these as the original's would: -975 for a live game's name; -966 for a map not offered
(`MAP_NOT_OFFERED_STATUS_PLACEHOLDER`, research 159 §3.4: at the create only when GameLevel names one, which this screen
never does -- the map is refused at the report), for respawn asked and for a field that does not fit; -945 past
`GAMES_PER_ROOM_PLACEHOLDER`. Every one but -975 shows #295.

## 5. A success: the game lobby's gate (R163.7)

On the console the success's state 15 joins the game (JoinGame, `FUN_002eda60`) and the screen's loop, seeing state 17,
runs `ConnectToGameServer`, `SetMPMissionSeq(PLAYLISTVAR)` (the play list expanded, research 203 §14), `JoinGameServer`,
STOP `menu_fade_up` and `SWITCHMENU(dlgGameLobby.rdr)`. That is ONL-16a's (the join, the world report with the map and
GameStats, the match socket), not built. `GAME_LOBBY_GATE_READING`: the module hands the created game -- the world id,
the full name, the request, PLAYLISTVAR's map numbers and the valves the report and GameStats read
(`CREATED_GAME_VALVES`) -- to the mount's `created`, then runs `SWITCHMENU(PREVIOUS_SCREEN)`: the screen goes back to its
caller, as TRIANGLE would. The game stays pending on the server (its host never joined): it is not listed (SVC-06 lists
no pending game) and ends at the host's next create (`GAMES_PER_HOST_PLACEHOLDER`) or the session's end. ONL-16a replaces
the return with the join.

## 6. The page and the entry (R163.8, R163.9)

`fetchCreateGameService(base)` posts the request as JSON to `<base>/lobby/create-game` with `authorization: Bearer
<ticket>`, `credentials: 'omit'`, `cache: 'no-store'`; `createGameReplyOf` checks `{ status, mediusWorldId }`.
`sessionCreateGame(transport, ticket, sessionLost)` is the dialog's `CreateGameService`: the ticket read at the request
(none: no request, as `ROOM_LIST_NO_TICKET_ADAPTATION`), a 401 handed to `LobbyClient.sessionLost(ticket)`
(`SESSION_LOST_READING`: state 2, MP_MEDIUS_ERROR with UIMnLOC 450, this dialog's `OnMultiplayerDisconnect`) and the
create then never answered. The base is `accountServiceBase`, the page's own origin, as the room list's (research 161 §3).

- `CREATE_GAME_HTTP_ADAPTATION`: 2xx the reply; 401 the session lost; 403, 404, 429, 5xx, another shape or no answer a
  Fail (-966), so #295 and back to the briefing room -- the original's dialog for any failed create, rather than CREATING
  left on the screen with TRIANGLE guarded.

**The entry.** `mountCreateGame(host, options)` registers the three rows on the session's host: the briefing room's mount
(ONL-12) calls it with the session's `uiVars`, the valve store, the event sink, `sessionCreateGame(fetchCreateGameService
(accountServiceBase), ticket, sessionLost)`, the missions (`missionsFromReaderc` of the disc's `RUN/READERC.ZAR`, research
164 §2), its own `roomWorldId` (`DAT_0066a538`, the room it joined) and, once ONL-16a exists, `created`. Then it removes
`OnCreateGamePress` from its gate (`CREATE_GAME_GATE_READING`, on `agent/s17-briefing`), and its CREATE GAME row runs the disc's own
`SWITCHMENU(dlgCreateGame.rdr)`. `openCreateGame(host)` dispatches that same switch for a caller without the row (the
rig's stand-in, SOCOM II ONLINE). Nothing of the page's session (`frontEnd.ts`) is touched by this task.

## 7. Unknowns, contradictions, what is not done

- **No capture compared.** `title_create_game.png`, `A_49` / `A_50` / `A_52` (the acceptance) were not scored: no
  browser on this host today. The capture comparison stays owed (ONL-32 for the proven level).
- **Against research 203 §1**: its "FRIENDLY FIRE default 1" is RESTORE DEFAULTS'; the first arrival shows
  `global_valves.rdr`'s 0 (§1). Reading, pending review.
- **The global valves.** The page seeds no `global_valves.rdr` yet (OPT-02's whole table); every create-game valve it
  declares is 0, which an absent valve reads too, so nothing shows differently. `RTimeValve`, `RCountValve`,
  `CustomGameSettings`, `CreateGameSettingsChanged`, `LadderRankRestriction` and `IsMedleyGame` are not declared there:
  the script makes them.
- **Rank restrictions and clan options** run as the set has them; their effects are parked: the rank bits reach the
  game only through the report's GameStats byte 7 (ONL-16a) and are not enforced (SVC-14, `ROOM_RANK_NOT_ENFORCED_READING`) *(retired 2026-10-09, SVC-14: the gate is enforced, research 261 §10)*;
  CLAN OPTIONS is disabled for a player in no clan only (§3; it read "for everyone while clans are parked (ONL-27)"
  until ONL-27's GetMyClans kept the clan, research 272 §3): a member chooses an affiliation and CREATE's GF3 carries
  it over his clan id (`clanField`, the client's `LobbyClan.clanId` handed to `mountCreateGame` by CLAN-ID-WIRE,
  2026-10-13; clan 12 under affiliations 1..4 is 0xA000000C..0xD000000C).
- **The keyboard's titles** for the game name, the password and the spectator password (#305, #306, #252) are PLAT-17's
  `KeyboardPurpose` handling, not re-read here.
- **MP_SYSTEM_MESSAGE** (`OnSystemMessage`) is bound and raised by no service on the path.
- **Not done here**: the page's mount (ONL-12's, §6); the join and the lobby (ONL-16a).

## 8. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `RESPAWN_ROW_DISABLED_READING` (`packages/ui/src/screens/createGameCommands.ts`) | `DisableButton(Respawn)` with `init_cg_screen`'s first row, every arrival | OT.R21 refuses respawn; the original has no unavailable state for it, and `DisableButton` is the screen's own way with a row that cannot be taken (§3) | respawn's return (OT.R21's "future date"), which removes it |
| `CREATE_LOCAL_CHECKS_READING` (`createGameCommands.ts`) | no room id: MP_GAME_NAME_EXISTS; a taken name: the server's -975 | `FUN_002f9410`'s two local look-ups (`FUN_002e4470`, `FUN_002e4570`) need the client's records, which the briefing room keeps; both failing post the same event (§4) | the briefing room's records handed in, if a difference ever shows |
| `GAME_LOBBY_GATE_READING` (`createGameCommands.ts`) | a success handed to `created`; `SWITCHMENU(PREVIOUS_SCREEN)` only when no lobby takes it | the join, the report and `dlgGameLobby.rdr` are ONL-16a's (§5); since 2026-10-05 the session mounts ONL-16a's `GameLobbyCommands.created`, which answers true, and the script goes on to the lobby (research 165 §5) | the fallback for a mount with no lobby |

Adaptations, named and not ledger suffixes: `CREATE_GAME_STATE_ADAPTATION` (`createGameCommands.ts`: CreateGame1 sent in
the row's call, no lobby state 13) and `CREATE_GAME_HTTP_ADAPTATION` (`packages/viewer/src/createGameHost.ts`, §6). Reused,
not added: research 157's `SESSION_LOST_READING`, research 161's `ROOM_LIST_NO_TICKET_ADAPTATION` (the same rule for the
create), ONL-06's `NET_CENSOR_TEXT_PLACEHOLDER`, SVC-06's `MAP_NOT_OFFERED_STATUS_PLACEHOLDER`,
`RESPAWN_REFUSED_STATUS_PLACEHOLDER`, `GAMES_PER_ROOM_PLACEHOLDER` and `GAMES_PER_HOST_PLACEHOLDER`.

## 9. The record

The tests named above, run one file group at a time (`--maxWorkers=1`, at most three files a call) on the dev host with
`SOCOM_DISC` and `SOCOM_PC_ROOT` set; the typechecks `npx tsc -b packages/ui` and `npx tsc --noEmit -p packages/viewer`;
`tools/test/docs.test.ts`, `conventions.test.ts` and `placeholderLedger.test.ts`. The counts are the task's report's.
