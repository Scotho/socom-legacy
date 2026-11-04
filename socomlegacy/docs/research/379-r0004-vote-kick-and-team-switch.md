# 379 -- r0004's vote-kick and team switch: the camera gate, the kick at once, "Team Switch Error!" (R4B-08, G19)

- Date: 2026-11-01. Task R4B-08 of the [r0004 plan](../plans/r0004-option-b.md), under the owner's ruling OT.R97
  (MISSION: r0004 is the specification for gameplay and front-end behaviour). Branch `agent/r4b-08`.
- Track: simulation. It changes who may vote (a dead player following a teammate may not), when a passed vote removes
  its target (at the deciding vote, mid-round), and what a seat moved between the sides on the in-lobby ARMORY sees.
- Status: **reading, pending review** (R4B.R3). Nothing here is measured running. This note's author re-read every r4
  site cited below with capstone (the scratchpad's `r4dis.py`) in `game/overlays_r0004/socom2_game_r0004.elf` (the PINE
  dump) **and** the served decrypt `game/r0004/served/socom2_game_served.elf`: no word differs over 0x2bbc10-0x2bbd10,
  0x2d1710-0x2d1760, 0x2d15c0-0x2d1610, 0x234ea0-0x234f18, 0x2bcc90-0x2bcd1c and 0x27a4b8-0x27a570. The strings
  0x41dbc0, 0x41dbe0, 0x41d9a0, 0x41dae0, 0x41db00, 0x41a0a8 and 0x41a0b8 were read in the PINE dump (none falls on its
  three contaminated words, 0x1e70cc and 0x2cc670/674). A reviewer who did not write this re-reads them before they
  count as readings (R4B.R4). dot corroborated the conditional dlgNetBanned branch after the pass test (0x2bbc84-0x2bbcc0)
  and the `force_new_db` / `Glswitchteams` insertion in `UIAdvanceMPMission`, and left the camera gate, the threshold
  and the team-switch case untraced (`r0004-dot/r0004-g16-g20-review.md` "G19", `independent-findings.md` lines 49-50).
- Sources: `C:/Projects/agent-mail/evidence/r0004-investigation/cluster-vote-kick-and-team-switch.md` §0-§8, REPORT.md
  row G19 and the corrections at its foot. r0001 is cited `FUN_<addr>` / `D:L<line>` of
  `game/analysis/socom2_game.elf.decomp.c`. The in-lobby ARMORY's `OnNetError` was decoded from the disc by
  `tools/dump-online-dialogs.ts --dialog dlg_equipment_mp.rdr` (read-only). No decompiled or disassembled text is pasted.
- The press link (September 2004: "you can no longer vote someone when you are watching the player from the dead player
  spectator mode"; "adjusting the parameters for having players vote other players off") is the cluster's
  (`sweep-external.md` lines 70-71, 110-113); that the second phrase means the timing is inference.

## 1. The vote rows' camera gate -- ported

r0004's in-game menu builder (`FUN_002344e0`, the same address in both builds) binds the two vote rows to new enables:
TEAMMATES > PLAYER n > VOTE RETAIN:REMOVE to r4 0x2d1710 (the `$t0` word at 0x234eb8; r0001 bound `FUN_0022f440`,
D:L83803) and SPECTATORS > VOTE ALL ON:OFF to r4 0x2d15c0 (0x234f10; r0001 `FUN_0022f210`, D:L83805). Both open with
the same prologue: the camera's viewed actor (r4 0x1fcd70 = r0001 `FUN_001fcd70`, the camera holder's +0xbc; 0x2d1720,
0x2d15d8), the page's own actor (r4 0x2b4f90 = `FUN_002b3580`; 0x2d1728, 0x2d15e0), equal -> the r0001 body
(0x2d1730, 0x2d15e8); else the spectator test (r4 0x2c4c40 = `FUN_002c2fd0`, D:L164609-164644; 0x2d1738, 0x2d15f0),
non-zero -> the body (0x2d1740, 0x2d15f8); else return 1, disabled (0x2d1748, 0x2d1600). The body is r0001's
(`FUN_0022f440` D:L81377-81398, `FUN_0022f210` D:L81284-81313, by the cluster's mnemonic compare). A disabled row is not
drawn (`FUN_00230870` D:L82151) and a parent whose rows are all disabled is not either (`FUN_00231a30`
D:L82568-82582), so:

| when the Chat menu opens | r0001 | r0004 |
|---|---|---|
| alive | VOTE + VOTE ALL (a spectator present) | same |
| dead, on his own body's death camera | VOTE + VOTE ALL (AD-10: no life test) | same (viewed == own) |
| dead, following a teammate | VOTE + VOTE ALL | PLAYER n > MUTE alone; SPECTATORS not drawn |
| an online spectator | RADIO alone (`FUN_00232bc0`, D:L83641-83644) | same (the gate's spectator branch is inert: no vote row there) |

**In the port:** `voteRowsOpen` (viewer `spectatorVote.ts`, `VOTE_ROWS_CAMERA_GATE_READING`) is
`cameraOnSelf || spectator` over the page's `MatchGate` -- `cameraOnSelf` is the spectator view's `watching` null, the
same state WEAPON EXCHANGE's gate reads (research 94 §B2). The Chat menu's TEAMMATES builds the VOTE row only then and
SPECTATORS returns no row otherwise (viewer `matchChat.ts`), and `NetPage.toggleVote` refuses the same, so the developer
K list cannot pass the menu's gate. The room keeps accepting a vote from a follower: the original's receive has no test
(the cluster's §1, "Not changed"; a modified client could still send one, inference). The original reads an enable once,
at the menu's opening; the port's menu reads its rows live, and `DEAD_CYCLE_WHILE_MENU_READING` keeps the camera from
cycling while the menu is open, so the two agree on every path the port has.

## 2. The kick at the deciding vote -- ported

r0001's Voter receive `FUN_002ba040` (D:L159749-159790) sets the voter's flag, counts, prints "Voting: You have %d
votes against you." (D:L159763-159766), calls the pass test `FUN_002c3550` and drops its result (D:L159767), then
broadcasts {1, voter, count} (D:L159780). r0004's twin, r4 0x2bbc10, is the same with this after the pass test (r4
0x2c51c0, called at 0x2bbc84): `beqz` to 0x2bbcc0 (0x2bbc8c); `BanSelfFromGame`'s body (r4 0x316900 = r0001
`FUN_002f95f0`) with the lobby 0x452730 (0x2bbc94-0x2bbc98; r4's command at 0x279d10, r0001 `FUN_00278d30` D:L123707,
makes the same call); the dialog switch (r4 0x2a5cb0 = r0001 `FUN_002a47b0`) to `dlgNetBanned.rdr` (0x41dae0) on the
game 0x442ef0 (0x2bbc9c-0x2bbcac); the voice's talk flag cleared (r4 0x32bc60 = r0001 `FUN_0030e6e0` with 0,
0x2bbcb0-0x2bbcbc); the broadcast follows (0x2bbcc0-). The pass test's mnemonics are r0001's, so the threshold is
unchanged: `votes > side / 2.0` (D:L165002, D:L165078).

So r0004 removes a target on the vote that passes, mid-round, with no 0.5 s WAIT before `dlgNetBanned.rdr`. The
round screens' test (`ExitOnStart`: `HaveBeenBannedFromGame`, `BanSelfFromGame`, WAIT 0.5, `dlgNetBanned.rdr`; research
179 §6.2, research 263 §5.2) is in the disc's scripts, which r0004's package does not replace (it replaces the overlays
only; REPORT F4's bound), so it stays a second trigger: it now catches a majority no vote's receipt made -- a side shrunk
by a leave after a tie.

**In the port:** the room counts on the server (OT.R27; research 263 §5.2), so the r0004 branch is the room's: `vote`
(match `room.ts`) tests `votePasses` after each counted vote and a pass removes that target at once through
`removeVoted` (the address ban, `onRemoved`, `kicked` 'vote', the close 4002 that the page routes to #539's
dlgNetBanned.rdr) -- `VOTE_KICK_AT_ONCE_READING`. `applyVotes` at `VOTE_KICK_POINT_READING`'s screen keeps the second
trigger through the same `removeVoted`. The talk flag needs no step of its own here: the close ends the page's match and
its voice with it. The original tests only the receiving console's own count (it is the target); the room tests the
target of the vote it counted -- the same seat.

## 3. "Team Switch Error!" on the in-lobby ARMORY -- ported

r0001's E3 Index handler `FUN_002baf30` (D:L160324-160370): kind 4 is a join refusal (a reason through a table, then the
event callback with MP_EJECT_SPECTATOR); any other kind is a team assignment -- the side, the index, the status report
(D:L160364-160366), nothing more. r0004's twin (r4 0x2bcb40) applies the same three (0x2bcc98-0x2bcca8), then takes the
current dialog (r4 0x3884e0 = r0001 `FUN_0036a200`; 0x2bccb0-0x2bccb8) and its name (+0x8e1, or the pointer at +0x8e8
when +0x8e0 bit 0 is set; 0x2bccc0-0x2bccd0), compares it (r4 0x198f18 = r0001 `FUN_00198f18` D:L15765, a byte
compare; 0x2bccd8) with `dlg_equipment_mp.rdr` (0x41dbc0) and, equal and the event callback set (0x2bcce8-0x2bccec),
fires MP_MEDIUS_ERROR (0x41d9a0) with "Team Switch Error! | Continue" (0x41dbe0; 0x2bccf4-0x2bccfc).

Who sends a team assignment: `FUN_002baea0` (D:L160302-160320), from the host's SWITCH TEAMS move `FUN_002c4290`
(D:L165546, D:L165563; reached from the Team Switch handler `FUN_002bae70`, D:L160281-160294); its two other calls send
kind 4 (D:L166384, D:L166390: refusals). "Alternate teams"' swap flips every console by the game object's bit (research
309 R309.6), not by this message. So the error is a SWITCH TEAMS answer landing on the ARMORY.

The ARMORY's `OnNetError` (`dlg_equipment_mp.rdr`, bound to MP_MEDIUS_ERROR; the disc's script, decoded): unless an
error is already being handled, it stops `UiBackToLobby`, shows `POPUP INPUT_STRING` with button #46 (or #44/#45 when
`mp_net_errno` is 32), waits for the press, WAIT 0.5, then `DisconnectFromGameServer` and `ReturnToBriefingRoom`. So the
player is shown the text and taken out of the game to the BRIEFING ROOM. r0001 took the new side silently.
`TEAM_SWITCH_STALE_ERRNO_READING` (the review's P3-3): the Team Switch Error writes no `mp_net_errno`, so a 32 left by
an earlier error (the port's `seatEnded` writes `NET_ERRNO_DISCONNECTED_READING`) would send the ARMORY to #44 and
SWITCHMENU(REBOOT) instead; whether the original clears it on its REBOOT or a later join is not read. Nothing is
written here, as the original writes nothing; settles: r0004's `mp_net_errno` writers traced, or a PCSX2 run of a game
left by a dropped connection, a new game joined, then a SWITCH TEAMS answer on the ARMORY.

**In the port:** the room is the game's host (`GAME_LOBBY_SERVER_MASTER_ADAPTATION`), and its game lobby view is the
page's team assignment: `GameLobbyCommands.gameLobby` (ui `screens/gameLobbyCommands.ts`) writes `player_team` from it.
It now remembers the seat's side since its welcome; a view moving the seat between the sides, in a game whose SWITCH
TEAMS is open (`IsSwitchTeamsOK`, `FUN_002f8ce0` D:L197459-197476: not affiliation 1, 2 or 4 -- in 4 a move is the swap's,
in 1 and 2 there is none), while the built dialog is `TEAM_SWITCH_ERROR_DIALOG`, posts MP_MEDIUS_ERROR with
`TEAM_SWITCH_ERROR_TEXT` after the side is written. The dialog's name is the front end's machine's current one
(`GameLobbyCommandsOptions.dialog`, handed in by viewer `frontEnd.ts` through `gameLobbyHost.ts`). The shared ARMORY
(viewer `lobbyArmory.ts`) keeps the disc's dialog built underneath for its errors, so the disc's `OnNetError` runs it.
The path is reachable: `switch_teams_anim` asks `SwitchSides` and then, on the host, focuses the ARMORY button
(`ActivateButton(weaponselect)` gives the focus, research 115/116 -- it does not open the ARMORY; corrected at the
review, P3-1), and the room's answer is asynchronous, so a client whose answer lands after it pressed CROSS on the ARMORY
meets it. **Not the host's page:** the host's own SwitchSides runs the move and the handler in one call (`FUN_002badd0`
D:L160270-160281 -> `FUN_002c4290` -> `FUN_002baea0` D:L160302-160320, its own slot handled at once), so its side
lands while dlgGameLobby.rdr is current; the room's round trip would let a host's fast CROSS reach the ARMORY first, so
the page skips the error when its seat is the session master's (`own.host`, what `IsSessionMaster` answers). `TEAM_SWITCH_ERROR_SPLIT_READING`: how the popup draws the text's ` | ` is the popup's; the
text is handed whole, as the original hands it.

## 4. Moot: SWITCH TEAMS re-enabled on ON_FORCE_NEW_DB

r0004's `UIAdvanceMPMission` (r4 0x27a480, r0001 `FUN_00279490` D:L123842-123884) first asks the running animation's
name (r4 0x26fcc0 on the menu 0x4415a8; 0x27a4b8-0x27a4c0), compares it with `force_new_db` (0x41a0a8; 0x27a4cc) and,
equal and `IsSwitchTeamsOK` (r4 0x315ce0 = r0001 `FUN_002f8ce0`, 0x27a4dc), queues record type 7 (`EnableButton`) for
`Glswitchteams` (0x41a0b8) on the menu queue 0x441890 (0x27a4ec-0x27a56c). `force_new_db` is the GAME LOBBY's (and the
ARMORY's) binding of ON_FORCE_NEW_DB, which the core sends to the slots marked late joiners when the host returns to
the lobby (research 203 row "13 GAMELOBBY", D:L125578-125586).

**Moot in the port:** nothing posts ON_FORCE_NEW_DB -- the event code exists only in the table (ui `dialog.ts`
`DIALOG_EVENTS`), no host or command posts it, and the port's `AdvanceMPMission` row answers 1 and does nothing (ui
`gameLobbyCommands.ts`; the lobby's deadline is the room's, match `gameLobby.ts`). Porting the re-enable would mean
building the late joiner's ON_FORCE_NEW_DB path first, which is not r0004's change. Recorded as
`FORCE_NEW_DB_SWITCH_ENABLE_READING` (note only), to port with that path if it is ever built.

**Also moot, the same handler's reason 0:** r0004 changes join refusal reason 0's text from "General Protection Fault"
(r1 S:0x3f2480) to "Game Join Error" (r4 0x41db80). The port produces no reason-0 refusal (the cluster's §7), so there
is nothing to change; not in G19's row, noted here only.

## 5. Re-filed (R4B.R6)

- `VOTE_KICK_POINT_READING` (match `room.ts`; research 263 §5.2, §6) -- **r0001's sole trigger, superseded by r0004
  (OT.R97)** as the only point; kept, its value unchanged, as r0004's second trigger (§2).
- AD-10's "a dead player votes whatever he watches" (research 227 §2.9; `round.vote.teammates` in the parity registry)
  -- **r0001, superseded by r0004** for a dead player following a teammate; the no-life-test reading stands for the
  living and for the dead on their own body.
- No `*_READING` is retired.

## 6. Tests

- central `test/room.test.ts`: the deciding vote removes its teammate at once, mid-round (the round still running), its
  rejoin refused; `onRemoved` told at that vote; the screens' trigger held by a majority a leave made (a tie, then a
  non-voter gone) -- GAME COMPLETE's start at a match's end, ROUND COMPLETE's within one, a voter's leave during FINAL
  ROUND undoing it; the retraction and the voter's-leave cases rebuilt on ties, which no receipt kicks.
- central `test/round.parity.test.ts`: a team of four's third vote kicks at once.
- central `test/bridge.test.ts`: the -972 refusal case passes unchanged (the kick now comes at the second vote; its
  comment says so). `test/acceptance/cut.acceptance.test.ts` case 3 arms the cut before the votes (slot-only,
  `S2U_ACCEPTANCE=1`; not run here). `test/helpers/matchProcessRig.ts` (SA-7a's game, `matchProcessReplay.test.ts`):
  the round-1 vote's target is no longer the page the round drops and brings back -- kicked at the vote now, that page's
  return was refused -972 on path B's re-token; the replays stay identical across the paths (12/12).
- B195 (the union with MV-PARITY b2, 2026-11-02): with the kick at once and b2's mover together, SA-7a's controls went
  red though each branch passed alone -- the turret games' gunner, on b2's longer walk to `mp72_turret01` (some 8 300
  ticks, not 3 500), was killed before it asked the mount (`gunnerDeaths` 1, `gunnerAsks` 0, `mounts` 0), and the clan
  game's first elimination came after the 40 000-tick guard (10 rounds, none decided). Neither the mount path nor the
  elimination changed: at the batch's head with `vote`'s at-once removal alone turned off (a diagnostic, not kept), both
  games give b2's counts exactly (turret: a mount at tick 8 345, 51 rounds; clan: decided at 39 453). The rig follows the
  reading: a gunner's game casts the host's vote alone, one short of a pass (no seat leaves its round 1, as before
  R4B-08, when its kick waited for a ROUND COMPLETE the turret run never reached); the guard is 60 000 (the clan game
  decided in its 13th round, its match over and its second launch's round by tick 54 432).
- viewer `test/matchChat.test.ts`: a dead follower's PLAYER n holds MUTE alone and SPECTATORS is not drawn; the own
  body's camera, dead or alive, keeps both. `test/netPageVoteLines.test.ts`: `toggleVote` refused while following,
  taken back on the own body.
- ui `test/screens/teamSwitchErrorR0004.test.ts` (new): the strings; a move on the ARMORY posts the event after the side;
  none on the GAME LOBBY, on the first view, for a watcher, for the swap (affiliation 4), after a new welcome.

## 7. Readings

| Name | Status and evidence needed |
|---|---|
| `VOTE_ROWS_CAMERA_GATE_READING` | viewer `spectatorVote.ts` (`voteRowsOpen`), used by `matchChat.ts` and `netPage.ts`: the vote rows only while the camera views the own body or the page is a spectator (§1: r4 0x2d1710 / 0x2d15c0's prologue 0x2d1720-0x2d1748, bound at 0x234eb8 / 0x234f10); r0001's rows with no camera test (D:L83803, D:L83805) superseded. Reading, pending review. To proven: a PCSX2 `--build r0004` game, a dead player cycled onto a teammate opening the Chat menu (no VOTE row, no SPECTATORS), and on his own body (both). |
| `VOTE_KICK_AT_ONCE_READING` | match `room.ts` (`vote` -> `removeVoted`): the deciding vote removes its target at once (§2: r4 0x2bbc84-0x2bbcbc); r0001's drop of the result (D:L159767) superseded. Reading, pending review. To proven: a PCSX2 `--build r0004` game of three or more a side, the deciding vote cast mid-round -- the target's dlgNetBanned.rdr at once. |
| `TEAM_SWITCH_ERROR_SPLIT_READING` | ui `gameLobbyCommands.ts`: "Team Switch Error! \| Continue" (r4 0x41dbe0) handed whole to the ARMORY's `POPUP INPUT_STRING`; how the popup draws the ` \| ` is not read. To proven: a PCSX2 `--build r0004` capture of a SWITCH TEAMS answer landing on the ARMORY, the popup's frame. |
| `TEAM_SWITCH_STALE_ERRNO_READING` | ui `gameLobbyCommands.ts`: the Team Switch Error writes no `mp_net_errno` (r4 0x2bccb0-0x2bcd04), so a 32 left by an earlier error sends the ARMORY's `OnNetError` to #44 and REBOOT; whether the original clears it is not read. To proven: r0004's `mp_net_errno` writers traced (a clear on REBOOT, the BRIEFING ROOM or `JoinGameServer`), or a PCSX2 `--build r0004` run: a game left by a dropped connection, a new game joined, a SWITCH TEAMS answer on the ARMORY. |
| `FORCE_NEW_DB_SWITCH_ENABLE_READING` (*note only*) | §4: r0004's `UIAdvanceMPMission` queues `EnableButton(Glswitchteams)` under `force_new_db` when `IsSwitchTeamsOK` (r4 0x27a4b8-0x27a56c); moot -- the port posts no ON_FORCE_NEW_DB. To proven: a PCSX2 r0004 late joiner in a lobby the host returns to, SWITCH TEAMS enabled after a use. |
