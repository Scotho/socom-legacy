# 309 -- Clan games: the swap after each full game (SVC-11, CLAN-SWAP)

- Date: 2026-10-13 (web sprint 19, clan games and the clans' ladder; the plan
  `../plans/2026-10-13-web-sprint-19-clan-games-and-the-clans-ladder.md`, the row CLAN-SWAP; roadmap 06 SVC-11; research
  308 §4.4 and §9 item 6, which flagged it).
- Status: **reading** (reviewed 2026-10-13 by a fresh reviewer: PASS WITH FINDINGS, high, its findings folded; written for CLAN-SWAP before its build; no code changed with it then -- ONL-20b (2026-10-14) has since built §7.1 items 1-2 and two of §8's constants, `READY_GATE_AFTER_MATCH_MS_READING` and `COME_FROM_BRIEFING_AFTER_MATCH_READING`, and row 184's command without its flip; a fresh reviewer
  re-reads it at the source before it counts as a reading). Every value of the original below is read from the retail
  decompilation (`socom2_game.elf.decomp.c`, `D:L<n>`, `FUN_<addr>`; cited, never pasted), the ELF's strings
  (`socom2_game.elf.strings.txt`, `S:0x<addr>`), two instruction words of the ELF read by hand through its program
  headers (`ELF 0x<addr>`: the third load segment, vaddr 0x1e7000 at file offset 0xd6600; `tools/elfImage.ts` is the
  repository's reader that would confirm them), and the disc's scripts as the repository's pinned dump holds them
  (`tools/test/onlineDialogs.pinned.json`, cited `P:L<n>`: `dlgMPBriefingRoom.rdr`, `dlgGameLobby.rdr`,
  `dlgMultiplayerFinalReally.rdr`). Three facts also rest on a byte search of the disc's archives (`RUN/UIZANIM.ZAR`,
  `RUN/MPZANIM.ZAR`, `RUN/READERC.ZAR`, `RUN/EXTZANIM.ZAR`, every `RUN/*.ZDB`) -- source inspection, not a reader's run;
  the reader that would confirm each is named where it is used. **No test was run for this note** (source inspection
  only). Nothing here is measured on the original running -- ONL-32's two-game "Alternate teams" transcript is the proven
  level.
- Stands on research [308](308-clan-games-joining.md) (§4.2 the host's placement and `DAT_004412d8`, §4.4 the swap in
  outline, §8 `CLAN_SWAP_AFTER_GAME_PLACEHOLDER`), [91](91-the-round.md) (§7 the team words, the 24 slot records; §18.3
  the match's end screens, where `ClanSwapSidesIndex` is found), [179](179-c1-match-server.md) (§6.18
  `CLIENT_FINAL_EXIT_PLACEHOLDER`: the clients leave GAME COMPLETE when the host does), [165](165-the-game-lobby-to-the-launch.md)
  (§8 the READY gate, `mp_45_sec_clock`), [166](166-the-loading-screen-from-the-lobby-to-the-match.md) (§4 the way back,
  `MATCH_END_RETURN_READING`), [104](104-the-valve-store-and-ui-variables.md) (R104.4 the TEMP valves and the level's
  teardown, R104.6 `global_valves.rdr`), [95](95-the-armory.md) (R95.5 the default type), [193](193-m2-mp-net-replication.md)
  (§4.2 the GameObject's layout) and [192](192-m1-mp-modes-rules.md) (G23 `AdvanceMPMission`'s play list), and does not
  restate them.
- Code as read (nothing changed): `packages/ui/src/uiCommands.ts` (rows 72 `CloseAndSwitch` and 184 `ClanGameSwapSides`,
  both 'declared'); `packages/ui/src/screens/gameLobbyCommands.ts` (`matchReturned`, the view's `player_team`);
  `packages/ui/src/screens/armoryProfileCommands.ts` (`CharacterProfile`'s modes, `SwapClanSides`'s calls);
  `packages/match/src/room.ts` (`endRound`, `startRound`, `GAME_COMPLETE_S`); `packages/match/src/gameLobby.ts`
  (`PreMatch`, `reopen`, `READY_GATE_MS_READING`); `packages/central/src/bridge.ts` (`roomOptions`' `onAbandon`,
  `STORED_LOADOUT_AT_LAUNCH_ADAPTATION`); `packages/viewer/src/lobbyMatch.ts` (`matchOver`, `MATCH_END_RETURN_READING`);
  `packages/viewer/src/frontEnd.ts` (the `back` path); `packages/viewer/src/net/lobby.ts` (the room's roster).

## 1. The answers

| row | answer | where |
|---|---|---|
| R309.1 | **The original returns every console to the same game's GAME LOBBY after a full game.** FINAL ROUND (10 s) then GAME COMPLETE, whose `ExitOnStart` runs on every console: `UpdateMpFinalStatsUiVars`, `IDFromBriefing` = 0, **`ClanSwapSidesIndex` += 1**, the ban test, then a client's `CloseAndSwitch(dlgGameLobby.rdr)` -- which only names the dialog (`FUN_00281a70` D:L128114), so it leaves when the host does -- and the host's `call_gamelobby` (WAIT 10, or the OK press after 5 s) and `return_to_gamelobby` (`player_ready_count` 0, `mp_x_sec_clock` 11, `CloseAndSwitch`: the switch to the menu state with the start dialog written -- not game state 5: after a full game the game's +0xd4 is set (`FUN_002a9b30` D:L150647 copies `mp_game_over` into it at the round's end; only `FUN_002a72d0` D:L149266 clears it, at the launch), so the host takes D:L128126-128128 -- and the game object re-sent, D:L128130; corrected at the review). In the lobby every online console's `check_loop` runs `AdvanceMPMission`: the READY deadline now + **45 s** because `mp_game_over` is set (`FUN_00279490` D:L123856-123862), the host's next map from the play list and the game object re-sent (D:L123863-123879); `FromBriefing` re-arms the kit for the side held (`IDFromBriefing` 0); `Enable_SM_Launch` runs the first-entry branch again (`ComeFromBriefing` 0, R309.2): the 10 s `ArmButtonClock`, **`SwapClanSides`**, and the master's READY held until the 45 s clock ends, a joiner's for its 10 s `ClientDAReadyButton`. Same seats, same sides, nobody ready; the next launch by READY or the host's force. | §2 |
| R309.2 | **`ComeFromBriefing` is 0 both at the first entry and in the lobby a match returned to.** The BRIEFING ROOM's start sets it 0 (`OnBriefingRoomstart`, P:L4294); `ArmButtonClock`'s end (P:L7044) and the ARMORY's way out (P:L7654) set it 1; no in-match screen names it (absent from `MPZANIM.ZAR`). It is no global valve (absent from `READERC.ZAR`, where `global_valves.rdr`'s names are), so it is TEMP, and the map's load drops TEMP valves (`FUN_002abd40` D:L151842 -> `FUN_00351cb0`; research 104 §3): the lobby re-entered after a match reads it 0 again. `ClanSwapSidesIndex` **is** a global valve (in that names table) and survives the match. *A correction to research 165 §8's parenthesis and `gameLobby.ts`'s `READY_GATE_SEATS_READING` doc*: "`ComeFromBriefing == 0`, a lobby a match returned to" is half of it -- 0 is also the first entry from the BRIEFING ROOM, so a joiner from the briefing room gets the 10 s `ClientDAReadyButton` lock too (the page's script; the room's rule there is unchanged). | §2.3 |
| R309.3 | **The port has no return to the GAME LOBBY after a full game -- the general path every game needs, not a clan matter.** The room ends the match with FINAL ROUND and GAME COMPLETE (`room.ts:5151-5156`, holds 3 + 10 + 10 s) and then **starts the next match itself** on the same map (`startRound(st.matchOver)` `room.ts:4831` -> `resetMatch`, `newMatchId`, `room.ts:5089-5090`); `PreMatch.launched` stays true (only an abandon's `reopen` resets it, `gameLobby.ts:250`, `bridge.ts:631`); the page's way back (`LobbyMatch.matchOver` `lobbyMatch.ts:232`, `GameLobbyCommands.matchReturned` `gameLobbyCommands.ts:953`) is built and tested but **has no caller outside the tests**, so the page stays in the match. No 45 s gate, no `AdvanceMPMission`, no `FromBriefing` re-arm, no `ClanSwapSidesIndex`. The owner is **ONL-20** (its goal "and return to the game lobby"; research 166 §4: "owed to PF-26 (the server's side of the return)"; sprint 23 holds ONL-20's close) -- proposed here as its own slice, **ONL-20b** (§7). CLAN-SWAP is blocked on it. | §3 |
| R309.4 | **The swap is the master's script plus a two-phase command.** `SwapClanSides` (P:L7161-7201), CALL_SEQUENCE'd from `Enable_SM_Launch` when `ComeFromBriefing` is 0 (P:L7203-7205), acts only on the session master with `ClanSwapSidesIndex` 1: index 0; `ClanGameSwapSides(START)`; on 1: `mp_locked_game` 1, `ForceMediusStatusReport`, WAIT 5, `ClanGameSwapSides(FINISH)`, the master's own kit re-armed for its new side, WAIT 10, WHILE `mp_teams_too_big`, `mp_locked_game` 0, `ForceMediusStatusReport`. The command (`FUN_0027d540` D:L125956-125999): START (S:0x3ef350) answers 1 only for affiliation 4 (`FUN_002e99e0`), setting `mp_locked_game` (S:0x3ef358) to 1 and calling `FUN_002f8350` (D:L197101-197110: on the online host one game update now, `FUN_002a9ee0`, which carries the lock bit); 0 otherwise. FINISH (S:0x3ef368) calls `FUN_002bada0` (D:L160253-160259) = `FUN_002c0040(!DAT_004412d8)` and answers 1. Any other argument answers 1 and does nothing. | §4 |
| R309.5 | **"All Switch" is not the swap.** It is a network message the host registers (`FUN_0030cff0(..., 0x440ea0, 0x2badc0, S:0x3f2448)`, D:L159141) with one 4-byte field, whose receive handler at **0x2badc0 is two words, `jr ra` / `addiu v0, zero, 4`** (ELF 0x2badc0, file 0x1aa3c0) -- it does nothing -- and that nothing sends (its id word `DAT_00440ea0` is read nowhere in the decompilation). `FUN_002bada0` (0x2bada0, 20 bytes) is a separate function reached only from FINISH (D:L125993). *A correction to research 91 §5's row "All Switch"* (91:255), which credits the message with the toggle. | §4.2 |
| R309.6 | **On the wire the swap is one bit of the host's game object; every console flips itself.** `FUN_002c0040` (D:L162971-162981) on the host: the flag set, `FUN_002c3330(DAT_00441470)` (the local `player_team` valve 0 / 8 by the word under the new flag, D:L164816-), `FUN_002c00f0` (the GameObject: the flag at byte 0x1b bit 4, D:L163091; research 193 §4.2), `FUN_002c5360` (the local persona republished, its team word unchanged, D:L166183-166212). Every client's GameObject update `FUN_002c0850` (registered D:L163593) compares that bit with its own flag and on a difference does the same three steps (D:L163463-163469). **The team words (0x40000001 / 0x80000100) and the 24 slot records do not change**: what flips is which word means the SEALs (`FUN_002c31a0`, `FUN_002c3080` D:L164649-164719), so every seated player, the host included, changes side together and keeps his slot, absent a forced side (`FUN_002c3330` D:L164816- rewrites the local team word when `DAT_00437dd4` is 1 or 2 -- not read, §9); spectators (bit 0x10000) stay. A later joiner takes the flag from the Game Signal (D:L161450-161458 -> `FUN_002c0040` D:L159266, D:L159331) and the host's affiliation-4 placement reads it (D:L161288; 308 §4.2). | §5 |
| R309.7 | **The kits: the script re-arms only the master after the swap.** Every console's `FromBriefing` re-armed its kit at the lobby's entry for the side it held then (P:L7561-7586), before the swap if it entered before the master's FINISH (5 s after the master's entry; a client's entry not read, §2.1); `SwapClanSides`' re-arm (`EQlimit` > 0: `SetMPWeaponValves`, `SetMPCharWeaponValves`; else `CharacterProfile` 2/0 and `EquipCharacterProfileSeal/Merc`, or the default type `MpCharSet` 1 / 5 by R95.5) sits inside `IsSessionMaster`. No script re-arms a client for its new side; what its kit is at the next spawn is not read (`CLAN_SWAP_CLIENT_KIT_READING`). | §6 |
| R309.8 | **The index is each console's own count**: 0 at its BRIEFING ROOM's start, +1 at each GAME COMPLETE, back to 0 only by the master's `SwapClanSides`. So the master swaps after every full game; a client's index keeps growing, and a client handed the session (`Session_master_migration`) after two or more games never sees index 1 at a lobby entry again -- **the swap stops after a host migration** unless the new master had finished exactly one game (`CLAN_SWAP_INDEX_READING`). | §4.3 |
| R309.9 | **Nothing of this applies to options 0-3 or to non-clan games.** START answers 0 for affiliations 0..3, so `SwapClanSides` only resets the index; no other path flips `DAT_004412d8` (its writers are D:L162977 and D:L163465; `FUN_002c0040`'s callers FINISH and the Game Signal's reader), and there is no general "switch sides after a match" rule. The per-player SWITCH TEAMS is a different message ("Team Switch", S:0x3f2438, handler `FUN_002bae70` -> `FUN_002c4290`; 308 §4.3). | §5.3 |

## 2. The return to the GAME LOBBY after a full game (the original)

### 2.1 What ends a match, and who leaves when

- **The end**: the net state +0x113 reaches 6 (`mp_game_over`) at a round's end (`FUN_002a9b30` D:L150660-150664; research
  91 §18.3), the stats are posted (respawn off), and FINAL ROUND (`dlgMultiplayerFinal.rdr`, 10 s) switches to GAME COMPLETE
  (`dlgMultiplayerFinalReally.rdr`).
- **GAME COMPLETE's `ExitOnStart`** (P:L14601-14637), on every console at the screen's start: the four totals lists
  disabled, `UpdateMpFinalStatsUiVars`, `IDFromBriefing` = 0, `ClanSwapSidesIndex` += 1; if `HaveBeenBannedFromGame`, the
  ban; else a client runs `CloseAndSwitch(dlgGameLobby.rdr)` and the 1 s watch `watch_for_switch_to_master`, the master
  `watch_for_switch_to_client`, which calls `call_gamelobby` (P:L14640-14643: WAIT 10, `return_to_gamelobby`).
  `MpFinalOnOk` (the OK press) runs `return_to_gamelobby` at once once `DoneCounting` is 1 (5 s, `MaintainDoneCounting`).
- **`return_to_gamelobby`** (P:L14644-14649): STOP `ExitOnStart`, `player_ready_count` = 0, `mp_x_sec_clock` = 11,
  `CloseAndSwitch(dlgGameLobby.rdr)`.
- **`CloseAndSwitch`** (row 72, `FUN_00281a70` D:L128101-128133): copies the dialog name into the menu state's start
  dialog (0x408568, D:L128114); online and **not host**, nothing more -- the client stays on GAME COMPLETE; online host,
  game state 5 (`FUN_002a7490`, D:L128124) or a switch to the menu state when the game +0xd4 is set (D:L128126-128128),
  then the game object re-sent (D:L128130). So every client leaves with the host, 10 s after GAME COMPLETE starts (research
  179 §6.18, which resolved `CLIENT_FINAL_EXIT_PLACEHOLDER`). *After a full game* the host takes the +0xd4 branch, not
  state 5: +0xd4 holds `mp_game_over` from the round's end (`FUN_002a9b30` D:L150647) until the launch clears it
  (`FUN_002a72d0` D:L149266, from D:L55634); how a client's menu state follows the host's switch is not re-read here.

### 2.2 What every console runs on re-entry

`dlgGameLobby.rdr`'s ONSTART starts seven animations (P:L6610-6616): `net_monitor`, `Session_master_migration`,
`Enable_SM_Launch`, `check_loop`, `FromBriefing`, `hide_game_details`, `FadeMusic`. For the return:

- **`check_loop`** (P:L7108-7127): `AdvanceMPMission` unless `GoneToArmory`, then the lobby's wait for the launch.
  `AdvanceMPMission` (`FUN_00279490` D:L123840-123882), on every online console (`DAT_0045a0c1`): the READY deadline
  (game +200, `mp_45_sec_clock`) = now + **45 000 ms when `mp_game_over` (game +0x10's valve) is set**, else 30 000
  (D:L123856-123862); on the host the play list's next map (Medley 0xfe, Random 0xff, or the entry; research 192 G23)
  written as the stem and the game object re-sent (D:L123863-123879).
  The port (LOBBY-ONE-BEHIND, 2026-11-08): its returned lobby's `AdvanceMPMission` loads the map just played, so
  `GameLobbyCommands.moveMission` loads the new map's variables (`mission_title`) again when the room's welcome or the
  returned (not launched) view's `nextMap` moves the map while the lobby stands. The host side -- the next map written
  into 0x414e00 before the load at D:L123881 -- is the reading, pending review; a non-host console's moment is not read
  (§2.1), and the port's room message (the welcome, `nextMap`) stands in for it. *LOBBY-MAP-STALE (2026-11-11,
  research 165 §9): the move's read is asynchronous, and when it landed while the rotation's 4021 had the seat down it
  was dropped, and the welcome on that same map loaded nothing again -- the last map's title stood. The read is now
  kept whenever the lobby still stands on that mission in the same game, and a move onto the mission held loads it
  again until its entries have landed; the original loads the mission at once after writing it (D:L123864-123881).*
- **`FromBriefing`** (P:L7551-7587): with `IDFromBriefing` 0 (GAME COMPLETE set it), the kit for the side held:
  `EQlimit` > 0 the restriction's valves; else the stored profile (`CharacterProfile` 2, then 0 and
  `EquipCharacterProfileSeal/Merc` by `player_team`), or the default type (`MpCharSet` 1 / 5, R95.5).
- **`Enable_SM_Launch`** (P:L7128-7223): the buttons (SWITCH TEAMS by `IsSwitchTeamsOK`), `mp_x_sec_clock` 11; the
  master's #350 popup under `ComeFromBriefing` 0 and `SeenPopup` 0; then, **`ComeFromBriefing` 0** (R309.2): `CALL
  ArmButtonClock` (the 10 s weapon-select count, P:L6999-7047) and `CALL_SEQUENCE SwapClanSides` (§4); then
  `SetupSessionMaster` (READY disabled `WHILE mp_45_sec_clock != 0`, P:L7224-7241), `SetupLateJoiner` or
  `SetupNormalJoiner` (`ComeFromBriefing` 0: READY disabled and the 10 s `ClientDAReadyButton`, P:L7278-7294).
- **The host's side** (the room is that host in the port): its seat records and sides unchanged, every seat not ready
  (`player_ready_count` 0), the launch clock idle at 11, the READY gate 45 s, the next map chosen, the game object
  re-sent; the launch again by the 80% / all-ready rule or `ForceMPLaunch`.

### 2.3 `ComeFromBriefing` and `ClanSwapSidesIndex` across a match

- **Writers of `ComeFromBriefing`** in the online scripts: `OnBriefingRoomstart` 0 (P:L4294), `ArmButtonClock`'s end 1
  (non-spectators, P:L7044), `goto_eq_mp_set_return_valve` 1 (P:L7654). Readers: `Enable_SM_Launch` (P:L7146, P:L7203),
  `SetupLateJoiner` (P:L7252), `SetupNormalJoiner` (P:L7283). The byte search finds the name in `UIZANIM.ZAR` only -- not in
  `MPZANIM.ZAR` (the round and final screens, where `ClanSwapSidesIndex` and `IDFromBriefing` are found), not in
  `READERC.ZAR`, and not among the ELF's strings, so no in-match screen and no code writes it.
- **Its lifetime**: `READERC.ZAR` holds a names table with `ClanSwapSidesIndex` beside `HDD_ENABLE`, `R_NAME_SIZE`,
  `MAX_CHAT_TEXT_LENGTH`, `NumClanMembers` and the campaign's `OP*` valves (byte offset 288154) -- read as
  `global_valves.rdr`'s (research 104 R104.6: 185 entries, PERM or PERSIST); `ComeFromBriefing` and `IDFromBriefing`
  are not in it, so a VALVE command's parse makes each at TEMP, 0 (R104.6), and the map's load drops the TEMP valves
  (`FUN_002abd40` D:L151842 -> `FUN_00351cb0`; the other drops D:L50758, D:L151630, D:L151993). The lobby a match returned
  to therefore reads `ComeFromBriefing` 0 and runs the first-entry branch (`COME_FROM_BRIEFING_AFTER_MATCH_READING`);
  without the drop, every master -- whose `ArmButtonClock` runs its 10 s out at the first entry, long before his READY
  opens at 30 s -- would come back with `ComeFromBriefing` 1, never reach `SwapClanSides`, and the swap would be dead. How a dropped valve a parsed command still points at is
  handed back (research 104's `VALVE_POOL_READING`) is not re-read; a script trace across a match's end settles it.
- **`ClanSwapSidesIndex`** survives (global): 0 at the BRIEFING ROOM's start (P:L4295), 1 after the first GAME COMPLETE,
  reset by the master's swap attempt -- so 1 at every return of a master who has played since (R309.8). Research 91 §18.3
  (91:808) is where the roadmap's "web R91 §18.3" points: found.

## 3. What the port does today after a full game

- **The room** (`packages/match/src/room.ts`): `endRound` computes `matchOver` (`isMatchOver`) and broadcasts `roundOver`
  with FINAL ROUND 10 s and GAME COMPLETE 10 s (`room.ts:5151-5156`; `GAME_COMPLETE_S` `room.ts:276`, the host's
  `call_gamelobby` WAIT 10, matching research 179 §6.18); after `ENGINE_READ_S` + both holds it calls
  `startRound(st.matchOver)` (`room.ts:4831`), which resets the match and starts round 1 of a new one on the same map at
  once (`room.ts:5089-5090`). The seats keep their sides; nobody is asked to READY.
- **The game's pre-match** (`gameLobby.ts`): `PreMatch.launched` is reset only by `reopen` (`gameLobby.ts:250`), which
  only an abandon with three or more left calls (`bridge.ts:631`, `ABANDONED_TO_LOBBY_PLACEHOLDER`). After a full game the
  room's `gameLobby` views keep `launched: true`. The READY gate is `READY_GATE_MS_READING` 30 s from a seat's entry; its doc
  names the 45 s "not on the path yet".
- **The page** (`packages/viewer/src/lobbyMatch.ts`): `LobbyMatch.matchOver` (`lobbyMatch.ts:232`, `MATCH_END_RETURN_READING`)
  takes the client back open and goes `back` into `dlgGameLobby.rdr` (`frontEnd.ts` writes the start dialog, re-enters the
  menu state and calls `GameLobbyCommands.matchReturned`, `gameLobbyCommands.ts:953`). **Its only callers are tests**
  (`viewer/test/lobbyMatch.test.ts:257`, `frontEndMatch.test.ts:157`, `:179`, `matchMount.test.ts:515`); the round
  screens (`roundScreens.ts`) draw GAME COMPLETE and call nothing. Research 166 §4 names the sequence the call would give
  today: the page back in the lobby, the room's view still launched, the room playing the next match without the page.
- **The page's valves**: GAME COMPLETE is drawn by the port, not by the dialog's script, so `IDFromBriefing` = 0 and
  `ClanSwapSidesIndex` += 1 are never written; the page's valve store keeps `ComeFromBriefing` across the match (no map
  load drops it), so the lobby the page would return to takes the `ComeFromBriefing` 1 branch -- no `ArmButtonClock`, no
  `SwapClanSides`.

**The gap, for every game** (none of it is clan-specific): the room's match end must reopen the game's lobby (not
launched, every seat not ready, sides kept, the host's READY gate 45 s from the return) and launch a new match only from
it; the page must leave the match when GAME COMPLETE's hold ends (`matchOver`), write GAME COMPLETE's valves
(`IDFromBriefing` 0, `ClanSwapSidesIndex` += 1) and enter the lobby with `ComeFromBriefing` 0 (R309.2) so the disc's
script runs `FromBriefing`'s re-arm, `ArmButtonClock` and `SwapClanSides`; `AdvanceMPMission`'s next map (research 192
G23) follows (with OT.R16's one-map lists it stays the same map). This is ONL-20's "return to the game lobby" (roadmap 05
ONL-20; research 166 §4 owes its server side to PF-26, which built the screens only); proposed as **ONL-20b** in §7.

## 4. The swap at "Alternate teams" (option 4)

### 4.1 The script and the command

- **`SwapClanSides`** (`dlgGameLobby.rdr`, P:L7161-7201) -- R309.4's steps. It runs from the lobby's ONSTART (via
  `Enable_SM_Launch`, `ComeFromBriefing` 0) on every console and does nothing unless `IsSessionMaster` and
  `ClanSwapSidesIndex` == 1; the index is reset before START is asked, whatever START answers.
- **START** (`FUN_0027d540` D:L125973-125988): the argument matched against S:0x3ef350 "START" (`FUN_00198b80`);
  affiliation 4 (`FUN_002e99e0`, `DAT_0044f780`; on the master the creator's): `mp_locked_game` acquired at type 1 and set
  1 through its watchers (D:L125977-125982), `FUN_002f8350` (D:L197101-197110: `DAT_0066a5f8` = 1 -- cleared at the lobby's
  init D:L182798, its reader not read -- and, online host, `FUN_002a9ee0` now, the host's game update that writes the
  lock bit into the game object, D:L150766; research 193 §4.2 byte 0x19 bit 6), answer 1; else answer 0.
- **FINISH** (D:L125990-125995): S:0x3ef368 "FINISH" -> `FUN_002bada0` -> `FUN_002c0040(DAT_004412d8 == 0)`, answer 1.
- **The lock's window**: from START to the end of `SwapClanSides` -- 5 s + the re-arm + 10 s + as long as
  `mp_teams_too_big` (1 while either side holds more than 8, `FUN_002c4500` D:L165660-165672: after a swap the counts are
  exchanged, so only a join in the window can raise it). While `mp_locked_game` is set the game is reported with status 3
  (`DAT_0044fe64`, `FUN_00303780` D:L203997-204008, `FUN_00303f40` D:L204351-204362; which report carries that byte is
  not read) and the game object's lock bit is set. The host's join handler (`FUN_002bc620` D:L161149-161492) reads no
  lock (`mp_locked_game`'s only readers are the game object's writers, D:L150766, D:L163104, the client's mirror D:L163371
  and those two status writers), so what refuses a join in the window, if anything, is the services' or nothing
  (`CLAN_SWAP_LOCK_PLACEHOLDER`).

### 4.2 "All Switch" (0x3f2448) and its handler

`FUN_0030cff0(0x45a0c0, 0x440ea0, 0x2badc0, 0x3f2448)` (D:L159141) registers the message "All Switch" with the field
list built just before it (one 4-byte field, D:L159139-159140), as "Team Switch" (D:L159138, handler `FUN_002bae70`) and
"Spec Vote", "Voter", "Names", "ClimbOK" are registered beside it. Its handler 0x2badc0 has no decompiled block (the
functions list: `FUN_002bada0` 20 bytes, then `FUN_002badd0`); the ELF's words at 0x2badc0 are `0x03e00008`,
`0x24020004` -- return 4, nothing else (ELF 0x2badc0). The words at 0x2bada0 confirm `FUN_002bada0` as decompiled
(`lbu` of 0x4412d8, `sltu`, `j 0x2c0040`, `xori a0, v0, 1`). Nothing sends the message: the id word `DAT_00440ea0`
appears in the registration only, while "Team Switch"'s `DAT_00440e98` is sent by `FUN_002badd0` (D:L160276). So the
swap reaches the clients only through the game object (§5); the "All Switch" message is an unused remnant.

### 4.3 The index rule, and a host migration

`ClanSwapSidesIndex` is written by three scripts only: `OnBriefingRoomstart` (= 0), GAME COMPLETE's `ExitOnStart` (+= 1),
`SwapClanSides` (= 0, master only). A client never resets it. `Session_master_migration` (P:L7437-7461) makes a client
the master inside the lobby without running `Enable_SM_Launch` again, and at the next return the new master's index is
the number of games he has finished since his BRIEFING ROOM, not 1 (unless that is one) -- so after a migration the
alternate game keeps its sides from then on (R309.8). A reading of the scripts as written; ONL-32's transcript of a
migration in an "Alternate teams" game is the proof (`CLAN_SWAP_INDEX_READING`).

## 5. Who is seated where after the swap, and what each console is told

### 5.1 The seats

- **Nothing moves in the records**: the 24 slot records (`DAT_004414c4[slot*2]`, research 91 §7) keep their team words
  and their slots; the head counts are recomputed under the new flag (`FUN_002c4500`), so the SEALs' list
  (`BSEALLISTVAR`) now lists the players whose word is 0x80000100 and the Terrorists' those with 0x40000001.
- **Who changes side**: every seated player, the host included (affiliation 4 seats him on the SEALs at the create,
  308 §4.1; after the swap he is a Terrorist). Spectators (word bit 0x10000) are untouched (`FUN_002c3330`: `player_team`
  0x10 kept).
- **The clan's side**: before the swap the members are on the SEALs (308 §4.2's table, flag 0); after it on the
  Terrorists, and a member joining later is placed on the Terrorists (the host reads the flag, D:L161288) and told the
  flag with his side (the Game Signal's byte, D:L161450-161458).

### 5.2 On the wire, and on each console

- **The host** (FINISH): `FUN_002c0040` -- the flag, its own `player_team` (`FUN_002c3330`, which writes the game's
  +0x14 valve 0 / 8 / 0x10 by the word under the flag, D:L164816-), the game object (`FUN_002c00f0`: the flag at byte 0x1b
  bit 4 among `EQlimit`'s nibbles, D:L163091; research 193 §4.2), its persona object (`FUN_002c5360`: the word at +0 is
  the same word).
- **Each client**: the replicated GameObject's update callback `FUN_002c0850` (D:L163253-; registered with the object's
  type at D:L163593) reads byte 0x1b bit 4 and, when it differs from its own flag, sets it, rewrites its `player_team`
  (`FUN_002c3330(DAT_00441470)`), calls `FUN_002c00f0` (a no-op off the host: its test is host and online, D:L163049) and
  republishes its persona (D:L163463-163469). Its lists draw from the same slot records under the new flag.
- **No per-player message**: no team word is sent anew for the swap; "All Switch" is never sent (§4.2).

### 5.3 Options 1-3 and non-clan games

START's affiliation test makes the whole script inert outside affiliation 4 (the index reset aside). No other code flips
the flag (R309.9). Two readings this leaves for the port: the flag is a property of the game (a new room starts
unswapped; the console's flag is not seen reset between games -- writes only at D:L162977 and D:L163465 -- and a block
clear of 0x4412d8 at a new game is not read: `CLAN_SWAP_FLAG_PER_GAME_READING`), and affiliation 4 alone reads it in the
placement (308 §4.2).

## 6. The kits after the swap

- **The master**: `SwapClanSides` re-arms him after FINISH for his new side (P:L7170-7192): with a restriction
  (`EQlimit` > 0) `SetMPWeaponValves` and `SetMPCharWeaponValves`; else his stored profile for the new side
  (`CharacterProfile` 2 then 0, `EquipCharacterProfileSeal` for `player_team` 0, `EquipCharacterProfileMerc` for 8), or
  without one the default type (`UiCharSet` 15, `ChangeCharacterType(1)`, `MpCharSet` 1 as a SEAL; 240, `(5)`, 5 as a
  Terrorist -- R95.5, `armoryProfileCommands.ts`'s modes 2 and 0).
- **A client**: its `FromBriefing` ran at the lobby's entry (P:L7561-7586) under the old side -- if it entered before the master's
  FINISH (5 s after the master's entry); how a client follows the host into the lobby is not read (§2.1), so a client
  entering after the flag's update arms the new side instead (`CLAN_SWAP_CLIENT_KIT_READING` holds either outcome); the update that flips its side (§5.2) runs no script, and no lobby script watches `player_team`. Its
  ARMORY (weaponselect, open after `ArmButtonClock`'s 10 s) would choose for the new side; check_loop's `SetMPWeaponValves`
  before the load sets the restriction's valves only. Whether the spawn re-validates the type against the side (research
  95's `ARMORY_TYPE_FALLBACK_READING` points at the load's revalidation) is not read: `CLAN_SWAP_CLIENT_KIT_READING`.
- **The port's side of it**: the bridge reads each seat's stored record **by its side at the launch**
  (`STORED_LOADOUT_AT_LAUNCH_ADAPTATION`, `bridge.ts:100-110`), and the room seats the default type when there is none
  (`ARMORY_TYPE_FALLBACK_READING`): once the room's sides are swapped before the next launch, every seat is armed for its
  new side with no further code. That is the master's behaviour applied to every seat -- the reading CLAN-SWAP files.

## 7. What CLAN-SWAP builds, and its blocker

### 7.1 The blocker, a row of its own: ONL-20b -- After a full game, back to the same game's lobby

Proposed as a slice of ONL-20 (as ONL-22a is of ONL-22): the general path, for every game on the online path. **About 3
to 5 points (M).** Not CLAN-SWAP's.

1. **The room reopens the lobby at a match's end** (held-launch rooms only, `heldLaunch`): after GAME COMPLETE's hold no
   `startRound(true)`; the game's `PreMatch` returned (`launched` false, every seat not ready, sides kept, the countdown
   cleared), the host's READY gate 45 s from the return (`READY_GATE_AFTER_MATCH_MS_READING`, 45 000, `FUN_00279490`
   D:L123856-123862), the view told; the next launch (all READY or the host's force) starts a new match (`resetMatch`,
   `newMatchId`, the load barrier) on the room. *Test first* (`packages/match/test/gameLobby.test.ts`, `bridge.test.ts`):
   after a full game the view shows not launched, nobody ready, the same sides, the host's `readyIn` 45; a joiner's READY
   at once; a second launch starts round 1 of a new match id. The original ONL-20b slice kept respawn unchanged;
   RSP-4 (2026-10-21, research 350) applies the shared launch/return path to held respawn games too, after re-reading
   the final-screen scripts with no respawn condition. Unheld dedicated respawn rooms remain continuous.
2. **The page leaves the match when GAME COMPLETE's hold ends**: the round screens' GAME COMPLETE (or the room's
   returned view) calls `LobbyMatch.matchOver`; the page writes GAME COMPLETE's `ExitOnStart` valves (`IDFromBriefing` 0,
   `ClanSwapSidesIndex` += 1) and enters the lobby with `ComeFromBriefing` 0 -- the page's valve store dropping its TEMP
   valves at the map's load as `FUN_002abd40` does, or the return writing it
   (`COME_FROM_BRIEFING_AFTER_MATCH_READING`). *Test first* (`packages/viewer/test/frontEndMatch.test.ts`,
   `packages/ui/test/screens/gameLobbyScreen.test.ts`): a match's end reaches `matchReturned` with no test hook; the
   lobby's ONSTART after it runs `FromBriefing`'s re-arm, `ArmButtonClock` and `SwapClanSides` (index 1, `ComeFromBriefing`
   0).
3. **The play list's next map** (`AdvanceMPMission`, research 192 G23's `playList.ts`): with OT.R16's maps a one-map list
   stays; the rotation can follow as its own row.
4. **Proof**: a two-page browser run through a full game back to the lobby and a second launch (the gate's `--e2e`), and
   ONL-32's capture of the return; until then the room's tests are the reading level.
   *Done 2026-10-14 for the rendered run: `packages/viewer/e2e/menuReturn.spec.ts` 1 passed (4.7 min, ONL-20b's proof, the
   plan's Log); ONL-32's capture is still the proven level.*

### 7.2 CLAN-SWAP, once ONL-20b exists

The smallest set, each with its failing test first. **About 2 to 3 points.**

1. **The swap flag and the swap, server-side** (`packages/match/src/gameLobby.ts` beside `isClanGame`, and the room's
   roster `packages/viewer/src/net/lobby.ts`): a per-game `swapped` flag (`CLAN_SWAP_FLAG_PER_GAME_READING`); `swapSides()`
   flips every non-spectator seat between `seal` and `terrorist` in the roster and in `PreMatch`, and the flag; CLAN-JOIN's
   `clanSide` (308 §9 item 1) reads the flag for affiliation 4 instead of 0 (`CLAN_SWAP_AFTER_GAME_PLACEHOLDER` retired);
   the index per seat (`CLAN_SWAP_INDEX_READING`: +1 at each match end, the host's tested and reset at the return).
   *Test first* (`packages/match/test/clanSwap.test.ts`, new): in affiliation 4 after a full game every player's side
   flipped, spectators kept, a later member joiner on the Terrorists; affiliations 0..3 never swapped; two games swap
   twice (back to the start); after a host change with the new host's count at 2, no swap.
2. **Row 184 `ClanGameSwapSides` on the page** (`packages/ui/src/screens/gameLobbyCommands.ts`, the row 'here'): START
   answers 1 for the held game's affiliation 4 (the host's `createdClanField`, `FUN_002e99e0`) and sets `mp_locked_game` 1,
   else 0; FINISH flips the page's own `player_team` at once (as `FUN_002c0040` does on the host) and sends the room the
   swap; any other argument 1. The disc's `SwapClanSides` script runs it unchanged; the other pages' `player_team` follows
   the room's view (`gameLobbyCommands.ts:913`, built). *Test first* (`packages/ui/test/screens/clanGameSwapSides.test.ts`,
   new): START over GF3 0, 0xA.., 0xB.., 0xC.., 0xD..; FINISH sends one request and flips `player_team`; the
   `SwapClanSides` sequence over the machine with index 1 asks START, waits 5 s, FINISH, re-arms (the default type for the
   new side), unlocks after 10 s.
3. **The room takes the swap only from the host, in affiliation 4, in the lobby a match returned to, once per return**,
   refusing any other (a modified page; the room is the host, as `CLAN_SWITCH_CLOSED_READING` keeps SWITCH TEAMS'); the next
   launch arms each seat by its new side through the existing stored-record read (`CLAN_SWAP_CLIENT_KIT_READING`); joins in
   the window admitted and placed under the flag as it stands (`CLAN_SWAP_LOCK_PLACEHOLDER`). The request is a new
   client-to-server message on the match socket: whether it is additive under `net/protocol.ts`'s version rule is the
   implementer's check. (The alternative -- the room swapping by itself 5 s after the return, no request -- races the
   host page's script re-arm, which reads `player_team` right after FINISH; the request with the local flip is the
   original's order.)
   *Test first* (`packages/central/test/bridgeClanSwap.test.ts`, new, over the fixtures like `bridgeClanTag.test.ts`; skips
   without them): an affiliation-4 game played to its end, the host's swap request taken and the views flipped; a
   joiner's request refused; a second request in the same return refused; affiliation 1 refused.
4. **Docs**: research 91's "All Switch" row and research 165 §8's parenthesis corrected (R309.5, R309.2); roadmap 06
   SVC-11's "the side swap" pointed at this note and ONL-20b.

## 8. Placeholders and readings

ONL-20b (2026-10-14) built two of them, `COME_FROM_BRIEFING_AFTER_MATCH_READING` and `READY_GATE_AFTER_MATCH_MS_READING`,
and added a third, `LATE_JOINER_RETURN_FROM_LOADING_READING` (their rows say "in code"); CLAN-SWAP (2026-10-14) built the
other four and retired `CLAN_SWAP_AFTER_GAME_PLACEHOLDER` (their rows say so; §10).

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `CLAN_SWAP_AFTER_GAME_PLACEHOLDER` (308 §8, proposed: server, the side rule) | `'never swapped: affiliation 4 seats the clan on the SEALs\' side every game'` | the swap after each full game (§4-§5); this note reads it in full | ONL-20b built, then CLAN-SWAP (§7.2 item 1) retires it; ONL-32's two-game transcript of an "Alternate teams" game | retired (CLAN-SWAP, 2026-10-14): `clanSide` reads the game's flag, `CLAN_SWAP_FLAG_PER_GAME_READING` |
| `COME_FROM_BRIEFING_AFTER_MATCH_READING` (ui `screens/gameLobbyCommands.ts`, ONL-20b: written by `matchReturned`) | `0` | the lobby a match returned to reads `ComeFromBriefing` 0: a TEMP valve (not in `global_valves.rdr`'s names, byte search of `READERC.ZAR`) dropped at the map's load (`FUN_002abd40` D:L151842 -> `FUN_00351cb0`) and made again at 0 by the lobby's parse. The page loads no map into its menus' valve store, so its return writes the one valve the lobby's entry reads (at TEMP, no promotion) rather than dropping every TEMP valve (`VALVE_POOL_READING`: how a parsed command's dropped valve is handed back is not read) | a script-valve trace across a match's end (PLAT-32's tracer), or ONL-32's capture of the 10 s weapon-select count (`TenCountWS`) after a match; `tools/` valve loader listing `global_valves.rdr` (the reader's confirmation of the absence) | in code (ONL-20b, 2026-10-14), reading, pending review |
| `LATE_JOINER_RETURN_FROM_LOADING_READING` (viewer `lobbyMatch.ts`, ONL-20b's review: `LobbyMatch.matchOver`'s loading branch) | `'a client not late still loading when the room returns to its lobby leaves from the loading screen, no loaded sent'` | what a client **not late** still in the load state (a seated console past the room's load ceiling) does when the host returns to the lobby -- the port's choice: the original's is not read (its done branch with +0xcc clear, `FUN_001f5e70` D:L55680-55687, D:L55704-55709, D:L55730-55745). Restated by LATER 238 (2026-10-21): a late joiner's load ends on W5 `dlgNetError.rdr` or W6 `dlgNetAbandoned.rdr`, never the lobby (research 315 §12.1, §14, `LATE_RETURN_RECORD_UPDATE_READING`) | a read of that branch against the host's return; or ONL-32's capture of a seated console loading at a game's end | in code (ONL-20b; restated LATER 238, 2026-10-21), reading, pending review |
| `READY_GATE_AFTER_MATCH_MS_READING` (server `gameLobby.ts`, ONL-20b: `PreMatch.reopen` at the room's return, the bridge's `onMatchReturn`) | `45_000` | `AdvanceMPMission`'s deadline when `mp_game_over` is set (`FUN_00279490` D:L123856-123862) -- a transcription; the room holds it on the host's seat only, as `READY_GATE_SEATS_READING` holds the 30 s | -- (a transcription; ONL-32's capture times it) | in code (ONL-20b, 2026-10-14), reading, pending review |
| `CLAN_SWAP_INDEX_READING` (server `gameLobby.ts`, CLAN-SWAP: `PreMatch`'s seat `swapIndex`, `matchReturned`, `askSwap`) | `'the host seat\'s own count of games finished since its entry or its last swap attempt; swap at 1'` | `ClanSwapSidesIndex`, a per-console valve reset only by the BRIEFING ROOM and the master's `SwapClanSides` (§4.3) -- after a host migration the swap can stop. The room: 0 at a seat's entry, +1 at each full game's return, the swapping host's 0 again; the host's swap taken only at 1 | ONL-32's transcript of a host migration in an "Alternate teams" game, then two more games | in code (CLAN-SWAP, 2026-10-14), reading, pending review |
| `CLAN_SWAP_CLIENT_KIT_READING` (server `bridge.ts`, CLAN-SWAP: `storedLoadouts`' side at the launch) | `'every seat armed for its new side at the next launch'` | the original re-arms only the master by script after the swap (P:L7170-7192); a client's kit after the swap is not read (§6) | ONL-32's capture of a non-host member's kit in the game after a swap (SEAL 1 / TERRORIST 1 against the old side's type); or a read of the spawn's type revalidation | in code (CLAN-SWAP, 2026-10-14), reading, pending review |
| `CLAN_SWAP_LOCK_PLACEHOLDER` (server `gameLobby.ts`, CLAN-SWAP: the bridge's join under the flag) | `'no join refused: a join in the window admitted and placed under the flag as it stands; no lock reported'` | what `mp_locked_game` does to a join during the window: the host's join handler reads no lock (`FUN_002bc620`); status 3 goes to the services (`FUN_00303780`, `FUN_00303f40`). The value as built differs from the proposal's ("the lock reported"): the page's `ForceMediusStatusReport` sends nothing and the server reports no status 3 | ONL-32's transcript of a join attempted during an alternate game's swap window; the services' answer to a JoinGame on a status-3 game | in code (CLAN-SWAP, 2026-10-14), placeholder |
| `CLAN_SWAP_FLAG_PER_GAME_READING` (server `gameLobby.ts`, CLAN-SWAP: `PreMatch.swapped`, `clanSide`'s `swapped`) | `'a new game starts unswapped'` | `DAT_004412d8` has no direct reset between games (writes D:L162977, D:L163465); a block clear at a new game not read; the port's flag lives with the game's `PreMatch` (one per game, the bridge's) | a read of the game's init for a clear of 0x4412d8 (around `FUN_002c5450`, D:L163589-163593); ONL-32's transcript of a new "Alternate teams" game by a host whose last game ended swapped | in code (CLAN-SWAP, 2026-10-14), reading, pending review |

The names this note leans on are listed where they live: `CLIENT_FINAL_EXIT_PLACEHOLDER` (research 179 §6.18, resolved),
`MATCH_END_RETURN_READING` (`viewer/src/lobbyMatch.ts`), `READY_GATE_MS_READING` and `READY_GATE_SEATS_READING`
(`match/src/gameLobby.ts`), `ABANDONED_TO_LOBBY_PLACEHOLDER` and `STORED_LOADOUT_AT_LAUNCH_ADAPTATION`
(`central/src/bridge.ts`), `ARMORY_TYPE_FALLBACK_READING` (research 95), `VALVE_POOL_READING` (research 104, note only there),
`CLAN_SWITCH_CLOSED_READING` (research 308 §8, note only until CLAN-JOIN builds it).

## 9. What is left

- **The reader's confirmations** (no node was run for this note): `tools/dump-dialogs.ts --json` over every set --
  `ComeFromBriefing`'s writers (none outside `dlgMPBriefingRoom` and `dlgGameLobby`), `ClanSwapSidesIndex`'s three; the
  valve loader over `READERC.ZAR`'s `global_valves.rdr` -- `ClanSwapSidesIndex` in it, `ComeFromBriefing` and
  `IDFromBriefing` not; `tools/elfImage.ts` at 0x2badc0 (the two words).
- **Not read here**: how a client's menu state follows the host's switch (the +0xd4 branch, §2.1) at the return (`FUN_002a7490` and the GameObject's
  state bits); `DAT_0066a5f8`'s reader; which report carries `DAT_0044fe64`; `FUN_002c3330`'s branch for
  `DAT_00437dd4` 1 and 2 (a forced side: which game type sets it); whether `SeenPopup` (the master's #350, "30 seconds")
  is TEMP and so shown again after each match although the gate is 45 s; the spawn's type revalidation against the side.
- **The proven level**: ONL-32's two-clan "Alternate teams" transcript over two full games -- the lock, the sides
  flipped on every console 5 s after the master's return, the kits, a later joiner's side, and a host migration -- and a
  two-client capture of the return to the lobby for any game (ONL-20b).

## 10. What CLAN-SWAP built (2026-10-14; reading, pending review)

Appended by CLAN-SWAP's implementer; §7.2's items, every cite above re-read at the source first (`FUN_002c0040`
D:L162973-162982, `FUN_002bada0` D:L160255-160259, `FUN_0027d540` FINISH D:L125990-125995, `FUN_002c3330` D:L164814-,
`FUN_002c5450` D:L166216-166258, `FUN_002bc620` D:L161286-161292, `SwapClanSides` P:L7161-7201) -- no disagreement found.

- **Item 1** (server `gameLobby.ts`, viewer `net/lobby.ts`): `PreMatch.swapped`, the game's flag
  (`CLAN_SWAP_FLAG_PER_GAME_READING`); each seat's swap index -- 0 at its entry, +1 at a full game's return
  (`PreMatch.matchReturned`, the bridge's `onMatchReturn`), the swapping host's 0 again (`CLAN_SWAP_INDEX_READING`); an
  abandon's reopen adds nothing (no GAME COMPLETE); `askSwap` / `swapSides` (every non-spectator seat flipped, the flag);
  `Lobby.swapSides` (every player flipped, spectators kept); `clanSide`'s `swapped` for affiliation 4 (member XOR flag,
  D:L161286-161292); `CLAN_SWAP_AFTER_GAME_PLACEHOLDER` retired. The host's side: at the creation `FUN_002c5450` gives
  the host the word that is the SEALs' (affiliation 1: the Terrorists'), the flag 0 then, so `hostClanSide` is unchanged
  and keeps affiliations 0-3; a host seated again in a swapped game (a launched game kept through its leave, then its
  hello -- the port's path, not the console's) is placed in affiliation 4 by the flag as a member, on its clan's side,
  since the host changes side with its clan (R309.6; the review's M1, the bridge's `join`).
  `packages/match/test/clanSwap.test.ts`, `bridgeClanSwap.test.ts` (the host's return).
- **The room's swap** (server `room.ts` `swapSides`): every player seated afresh on its new side, as SWITCH TEAMS seats one,
  only while the room waits.
- **Item 2** (ui `screens/gameLobbyCommands.ts`, row 184): FINISH flips the page's own `player_team` at once (0 <-> 8, a
  spectator's 16 kept: `FUN_002c3330`) and sends `clanSwap` on an open socket; START and any other argument as ONL-20b
  built them. `packages/ui/test/screens/clanGameSwapSides.test.ts` (synthetic) and `gameLobbyScreen.test.ts` (the
  `SwapClanSides` sequence over the machine: START, WAIT 5, FINISH, the default TERRORIST type re-armed, the unlock after
  the WAIT 10).
- **Item 3** (server `bridge.ts` `clanSwap`; the match socket's `clanSwap`, additive under protocol 11): the room takes the
  request only from the host, in affiliation 4, not launched, with no countdown, at the host's swap index 1 (the lobby a
  match returned to, once per return); refusals to the requester only (`host`, `clan`, `swap`, `launched`, `countdown`,
  `seat`), nothing changed; taken, `Room.swapSides` then `PreMatch.swapSides`, every seat told. The countdown refusal is
  the room keeping the screen's rule, as `SWITCH_CLOSED_AT_COUNTDOWN_READING` keeps SWITCH TEAMS' (the stored kits are read
  at the countdown's start). `packages/central/test/bridgeClanSwap.test.ts` (MP72).
- **The kits** (server `bridge.ts`): no new code -- the launch reads each seat's stored record by its side then
  (`storedLoadouts`), so every seat is armed for its new side (`CLAN_SWAP_CLIENT_KIT_READING`).
- **The lock** (`CLAN_SWAP_LOCK_PLACEHOLDER`): no join refused; a join in the window placed under the flag as it stands.
  Its value as built says "no lock reported" where §8's proposal said "the lock reported": the port reports no status 3.
