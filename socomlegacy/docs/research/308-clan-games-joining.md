# 308 -- Clan games: the joining and the sides (SVC-11, CLAN-JOIN)

- Date: 2026-10-13 (web sprint 19, clan games and the clans' ladder; the plan
  `../plans/2026-10-13-web-sprint-19-clan-games-and-the-clans-ladder.md`, the row CLAN-JOIN; roadmap 06 SVC-11).
- Status: **reading** (reviewed 2026-10-13 by a fresh reviewer: PASS WITH FINDINGS, folded at 7bc7386d9; written for CLAN-JOIN before its build; no code changed with it). Every value of
  the original below is read from the retail decompilation (`socom2_game.elf.decomp.c`, `D:L<n>`, `FUN_<addr>`; cited,
  never pasted), the ELF's strings (`socom2_game.elf.strings.txt`, `S:0x<addr>`) and the disc's scripts as the
  repository's pinned dump holds them (`tools/test/onlineDialogs.pinned.json`, `tools/dump-online-dialogs.ts`'s output:
  `dlgMPBriefingRoom.rdr`, `dlgCreateGame.rdr`, `dlgGameLobby.rdr`, `dlgMultiplayerFinalReally.rdr`). Two absences
  (§2.3, §6) are also checked by a byte search of the disc's script archives (`RUN/UIZANIM.ZAR`, `RUN/EXTZANIM.ZAR`,
  `RUN/MPZANIM.ZAR` and every `RUN/*.ZDB`) -- source inspection, not a reader's run; the reader's confirmation is named
  where it is used. **No test was run for this note** (source inspection only). Nothing here is measured on the original
  running -- ONL-32's two-clan transcripts are the proven level.
- Stands on research [91](91-the-round.md) (§7 the teams: the 24 slot records, the team words and `DAT_004412d8`, the
  joiner's balance rule, the clan options' row), [163](163-create-game.md) (CLAN OPTIONS, `CreateClanAffiliation` 0..4,
  GF3 at the create), [165](165-the-game-lobby-to-the-launch.md) (the game lobby to the launch), [265](265-online-options-and-online-filters.md)
  (§2.4 AUTOPLAY's `FUN_002e9940`, §2.5 `SetFilters` called by no script), [268](268-the-friends-and-the-player-lookups.md)
  (§3.4 the room's PLAYER LIST and `CLAN_TAGS`), [272](272-clan-roster.md) (§3 GetMyClans: the client's clan id
  `DAT_0044f59c`), [264](264-the-results-path-and-the-ladders-guards.md) (§4 SVC-23f: a host's refusal shown through
  MP_EJECT_SPECTATOR) and [107](107-the-ui-command-table.md) (R107.7 the two constant stubs), and does not restate them.
- Code as read (nothing changed): `packages/ui/src/uiCommands.ts` (rows 82 `IsClanChallengeGame`, 103
  `NotOnCorrectClanTeam`, 104 `IsSwitchTeamsOK`, 156 `ClanGameClosed`, 184 `ClanGameSwapSides`);
  `packages/ui/src/screens/createGameCommands.ts` (`clanField`); `packages/ui/src/screens/gameLobbyCommands.ts`
  (`ClanGameClosed`, `IsSwitchTeamsOK`, `seatEnded`, `TOO_MANY_SPECTATORS_TEXT`); `packages/ui/src/screens/autoplayCommands.ts`
  (`clanFieldAdmits`); `packages/ui/src/screens/briefingRoomCommands.ts` (the CLAN column, `CLAN_TAGS`,
  `ROOM_PLAYER_CLAN_TAGS_PLACEHOLDER`); `packages/viewer/src/net/lobby.ts` (`assignTeam`, `Lobby.join`, `switchTeam`);
  `packages/match/src/room.ts` (`hello`'s host side, `switchTeam`, `TOO_MANY_SPECTATORS`); `packages/central/src/bridge.ts`
  (`join`, `seatFor`, `request`); `packages/match/src/gameLobby.ts` (`isClanGame`, `PreMatch`);
  `packages/central/src/lobby.ts` (`joinGame`, the CLAN column `gameListColumns`); `packages/central/src/clans.ts`
  (`seatClanTag`).

## 1. The answers

| row | answer | where |
|---|---|---|
| R308.1 | **`NotOnCorrectClanTeam` is called by nothing.** Its body (`FUN_002775e0` D:L122911-122920) answers the negation of `FUN_002e80c0` (D:L187331-187359): "on the right side" is 1 for a game with no clan id, for affiliation 4 and for a spectator; else a member of the game's clan must be on the SEALs' side exactly when the affiliation is not 1, an outsider on the other. No script on the disc names it, and no code calls `FUN_002e80c0` but it; its rule even disagrees with the host's own placement in affiliation 3 (§2.4). So the lobby does nothing "on true": the sides are the host's placement at the join (R308.3). | §2 |
| R308.2 | **#524 is the BRIEFING ROOM's own refusal**, before any request: `aux_join_game` asks `ClanGameClosed(INPUT_STRING)` first (before the rank test, for a join and a watch alike); 1 shows POPUP #524 with one button #226 and stops the join, and the player stays in the BRIEFING ROOM's game list. `ClanGameClosed` (`FUN_0027d4c0` -> `FUN_002f8c60` D:L197433-197455) is 1 when the listed game's GF3 is a members-only clan game (`FUN_002e9940` D:L188215-188244: top nibble 0xC) of another clan than the client's. Already built (`gameLobbyCommands.ts` `ClanGameClosed`, `clanFieldAdmits`); the port draws #524 from the disc. **#524's text is not in the repository: owed.** Behind it, the host refuses the same join itself: Game Signal side 4 code 4, the joiner's text "Closed clan game" (S:0x3f24f0) through MP_EJECT_SPECTATOR (§3.2) -- not built. | §3 |
| R308.3 | **The host places every joiner; Medius decides nothing.** The client sends only "I am a member of this game's clan" (mask 2 of its join request's flags: the game's clan id non-zero and equal to its own, `FUN_0030d380` D:L209952-209955). The host (`FUN_002bc620` D:L161256-161299, D:L161355-161395): affiliation 1 members to the Terrorists, outsiders to the SEALs; 2 members to the SEALs, outsiders to the Terrorists; 3 outsiders refused (code 4), members by the usual balance; 4 members to the SEALs' side while the sides are unswapped (`DAT_004412d8` 0), to the Terrorists' once swapped, outsiders opposite; a forced side that is full refuses the join "Too many players" (code 3). The host itself is a Terrorist in affiliation 1, else a SEAL (`FUN_002c5450` D:L166238-166262). **The port today** places by the balance alone (`assignTeam`, `packages/viewer/src/net/lobby.ts:52`; the host always 'seal', `room.ts` `hello`): no clan input anywhere. The roadmap's "`lobby.ts` `assignTeam`" is that file, the room's roster -- not the server's `lobby.ts`. | §4 |
| R308.4 | **`FILTER_CLANAFFILIATION` and `FILTER_CLANONLY` are dead**: three of the eight UI variables row 27 `SetFilters` adds (S:0x3ef190, S:0x3ef1e0; the arguments `SetFilters` compares, S:0x3ef250 "ClanAffiliation" and S:0x3ef2b8 for Clan Only, set the texts S:0x3ef260 "Clan Affiliation" and S:0x3ef2c8, D:L125435-125437), and no script calls `SetFilters` (research 265 §2.5). The game list's clan use is its CLAN column (GF3 non-zero, D:L184459-184464) and AUTOPLAY's `FUN_002e9940`, both built. **`CLAN_TAGS` is not the game list's**: it is the room's PLAYER LIST argument of `RefreshRoomPlayerList` (`FUN_0027d900` D:L126105-126146, the name test at D:L126119, then `FUN_002f0ea0`), research 268 §3.4's `ROOM_PLAYER_CLAN_TAGS_PLACEHOLDER` -- outside CLAN-JOIN. | §5 |
| R308.5 | **`IsClanChallengeGame` is a constant 0 with no caller**: its body is `jr ra` / `move v0, zero` (R107.7, pinned by `tools/test/uiCommandTableDisc.test.ts`); no script names it; nothing in the decompiled code references 0x2795d0; "IsClanChallengeGame" (S:0x3edca0) is the ELF's only string with "challenge" in it. So a clan challenge is nothing beyond the affiliation games. | §6 |
| R308.6 | **A clan game launches on 100% ready or the host's force**: the host's per-frame ready count (`FUN_002c40c0` D:L165444-165510) raises MP_EIGHTY_READY only when the affiliation is 0 (D:L165503-165507), so in any clan game (1..4) the game launches only when every player's seat is READY (the all-ready launch, at once, D:L165379-165384) or by the countdown the host starts with `ForceMPLaunch` (`FUN_0027d070` D:L125792-125812, no clan test). Built by CLAN-EIGHTY (`gameLobby.ts` `isClanGame`; `gameLobby.test.ts`). The caption that says it ("Requires 100% ready to launch", as roadmap 05 N10 quotes the CLAN OPTIONS row) is one of #264-#272; which, and its exact text: owed. | §7 |

## 2. `NotOnCorrectClanTeam`

### 2.1 The body

Row 103 (0x2775e0, D:L122911-122920) calls `FUN_002e80c0` with the lobby (0x44f370, D:L122918) and answers 1 when that
answers 0. `FUN_002e80c0` (D:L187331-187359), in prose:

- it answers 1 ("on the right side") when the game's clan id `DAT_0044f778` is 0 or the affiliation `DAT_0044f780` is 4
  (D:L187343);
- else it takes two facts: the affiliation is not 1 (D:L187344), and the client's own clan id `DAT_0044f59c` equals the
  game's (D:L187345); a spectator (`FUN_002c2fa0` D:L187346, research 179's "is the local player a spectator",
  `FUN_002f6d00`) answers 1;
- else it asks whether the local player is on the SEALs' side (`FUN_002c31a0` D:L164708-164718: the local team word
  `DAT_00441470` against 0x40000001, or 0x80000100 when `DAT_004412d8` is set -- the SEALs' word as research 91 §7 and 94
  read it) and answers 1 when, for a member, "on the SEALs' side" equals "affiliation not 1", and for an outsider when it
  differs (D:L187348-187356); else 0.

So its rule is: affiliation 1 the clan on the Terrorists' side, affiliations 2 and 3 the clan on the SEALs', outsiders on
the other side; affiliation 4 and clanless games are never "wrong".

### 2.2 The two globals it reads

- **`DAT_0044f780` (the affiliation 0..4) and `DAT_0044f778` (the game's clan id)** are written by: the create,
  `FUN_002e9840(CreateClanAffiliation)` (D:L188172-188200, from D:L190556), which copies the client's clan id for 1..4
  and clears both for 0; the join's decode of the listed game's GF3, `FUN_002e9ab0` (D:L188285-188307: the low 28 bits the
  clan id, the top nibble 0xA..0xD the affiliation 1..4, anything else 0), from `JoinMPGame`'s `FUN_002f83b0`
  (D:L197301, the entry's +0x3c) and AUTOPLAY's `FUN_002f9220` (D:L197694); and the clears `FUN_002e9920`
  (D:L188204-188211) at the lobby's two resets (D:L182646, D:L182791).
- **GF3 itself** is `FUN_002e99f0` (D:L188256-188282): 0 for affiliation 0, else the clan id ORed with
  0xA0000000..0xD0000000 -- the port's `clanField` (`createGameCommands.ts`).
- `FUN_002e99e0` (D:L188247-188253) answers the affiliation; `FUN_002e9b30` (D:L188311-188317) answers "the game's clan id
  is non-zero"; `FUN_002e9820` (D:L188163-188169) answers "my clan id equals the game's".

### 2.3 Its callers: none

- No dialog of the online path names it: the pinned dump of every online dialog and of the shared library
  (`onlineDialogs.pinned.json`: BRIEFING ROOM, CREATE GAME, GAME LOBBY, the round and final dialogs, `UIanim.rdr`) holds
  `ClanGameClosed` and `ClanGameSwapSides` but not `NotOnCorrectClanTeam`; the dialog inventory names it only among the
  ELF's binding names (`dialogInventory.pinned.json`, `elf.bindingNames`).
- No script anywhere on the disc names it: a byte search of `UIZANIM.ZAR`, `EXTZANIM.ZAR`, `MPZANIM.ZAR` and every
  `RUN/*.ZDB` finds the string in none (where `ClanGameClosed`, `ClanGameSwapSides` and `IsSwitchTeamsOK` are found in
  `UIZANIM.ZAR`). The reader's confirmation is `tools/dump-dialogs.ts --json` (the sets' command names) showing it in no
  set.
- No code calls `FUN_002e80c0` but row 103 (its one reference, D:L122918).

### 2.4 Where its rule and the host's differ

In affiliation 3 the host seats members by the usual balance (§4.2), so half a members-only game sits on the Terrorists'
side, where `FUN_002e80c0` would call them "wrong"; in affiliation 4 it calls everyone right although the host forces
sides. Both are moot -- nothing asks it -- and are why it is read as a leftover, not a rule the port must apply
(`NOT_ON_CORRECT_CLAN_TEAM_UNCALLED_READING`, §8).

## 3. The join refusals: #524 and the host's Game Signal

### 3.1 #524, the client's own refusal

- **The script** (`dlgMPBriefingRoom.rdr`, `aux_join_game`'s first sequence): `ClanGameClosed(INPUT_STRING)` is asked
  before anything else -- before `GameRejectsRank` (#525) and before the passwords, and for a join and a watch alike (the
  test comes before `JoinAsSpectator` is read). On 1: `SuspendMenuInput(0)`, `POPUPDIALOG`, POPUP #524 with button #226,
  `STOP aux_join_game`. Nothing is sent; the player is left on the BRIEFING ROOM with the popup until he closes it.
- **The test**: `ClanGameClosed` (row 156, `FUN_0027d4c0` D:L125939-125953) -> `FUN_002f8c60` (D:L197433-197455): the room's
  game by the caption (`FUN_002e4470`, `FUN_002e4570`), then `FUN_002e9940` (D:L188215-188244) over its GF3: 0 ("closed")
  only for a top nibble 0xC (affiliation 3) whose low 28 bits are not `DAT_0044f59c`; so 1 = a members-only game of
  another clan, or of any clan for a player in none (his id -1).
- **The port**: built -- `GameLobbyCommands.ClanGameClosed` over `clanFieldAdmits` (`autoplayCommands.ts`), the client's
  clan id from `LobbyClan.clanId` (CLAN-ID-WIRE); held by `packages/ui/test/screens/clanGameClosed.test.ts`. The popup's
  text is the disc's UIMnLOC 524, drawn by the script; **its words are not quoted in any note or test: owed**
  (`tools/dump-online-dialogs.ts --dialog dlgMPBriefingRoom.rdr`, which prints the dialog's captions; `tools/dump-dialogs.ts
  --msg-users 524 524` names the dialogs that use it).

### 3.2 The host's refusal: Game Signal side 4, code 4 "Closed clan game"

- **The host's test** (`FUN_002bc620`, the join request's handler, D:L161149-161492): for a player's join (not a watch:
  the watch flag from the request's mask 1) into a game with a clan id (`FUN_002e9b30`, D:L161256), the request's mask 2 read as
  "a member" (D:L161258); affiliation 3 and not a member -> the reply's side byte 4 and reason byte 4 (D:L161260-161285,
  the reason at D:L161274), sent by the session master only.
- **The joiner's reader** (`FUN_002b9150` D:L159168-, the Game Signal): side 4 is a refusal (D:L159206), its reason picks
  the text -- 0 "General Protection Fault", 1 "Password Error", 2 "Too many spectators", 3 "Too many players", **4
  "Closed clan game"** (S:0x3f2480-S:0x3f24f0; anything else "Totally unknown error", S:0x3f2510) -- formatted through
  S:0x3f2478 and posted with MP_EJECT_SPECTATOR (S:0x3f2530, D:L159227): the same path as research 264 §4's "Too many
  spectators".
- **Where the joiner returns**: the BRIEFING ROOM's `spectator_rejected` (`halt_join`, `DisconnectFromGameServer`, #527 on
  JoiningAnim, a popup of the text with #226, then `SWITCHMENU(dlgMPBriefingRoom.rdr)`), or, if the GAME LOBBY already
  holds the join, its own `spectator_rejected` (`DisconnectFromGameServer`, the popup with #364, `KillPopup`,
  `ReturnToBriefingRoom`).
- **When it is reached**: the client's #524 (§3.1) and AUTOPLAY's candidate test (`FUN_002e9940`, research 265 §2.4)
  apply the same rule over the same two ids first, so an unmodified client never sends this join; the host's test is the
  guard behind them. The port's room is that host for every game (OT.R26: a page may be modified), so it must refuse it.
- **A watch is admitted by the host**: the clan block runs for players only (D:L161256-161258), so a non-member's watch
  of a members-only game passes the host, though the client's `aux_join_game` refuses it first with #524
  (`CLAN_CLOSED_WATCH_READING`, §8).
- **The services do not refuse it**: Medius' JoinGame carries no clan test on the client's side of the wire (its fields
  are the world, the join type and the password, research 154 §2), and the port's `lobby.ts` `joinGame` has none; the
  refusal is the host's.

### 3.3 Code 3 "Too many players" for a forced side

When the clan rule forces a side (affiliations 1, 2, 4) and that side holds 8, the host refuses the join with reason 3
(D:L161357-161388): the forced choice never falls back to the other side. The joiner shows "Too many players"
(S:0x3f24d0) the same way. (Reason 3 is also the players' total at `MaxPlayersValve`, S:0x3f27c0, D:L161329-161352,
where the port queues the joiner as a spectator instead -- an older deviation of the room's roster, not this row's.)

## 4. The sides in a clan game

### 4.1 The host's own side

`FUN_002c5450` (D:L166218-166312) seats the creating console: a spectator host on the spectators (D:L166260-166263); a
host whose game has a clan id and affiliation 1 on the Terrorists (the Terrorists' count 1, the word that is the
Terrorists' under the current swap flag, D:L166250-166257); every other host on the SEALs (D:L166241-166249). The host
holds the game's clan (its create copied its own clan id, §2.2), so this is the members' side of §4.2.

### 4.2 A joiner's side

- **What the client sends**: its join request (`FUN_0030d380` D:L209925-) carries mask 1 for a watch (D:L209966-209968)
  and **mask 2 when the game has a clan id and the client's own clan id equals it** (`FUN_002e9b30`, `FUN_002e9820`,
  D:L209952-209955) -- the client's GetMyClans copy (`DAT_0044f59c`, research 272 §3) against the GF3 it joined with.
- **What the host decides** (`FUN_002bc620`, a player's join with a game clan id, D:L161256-161299): it forces one side
  or none --

| affiliation (CLAN OPTIONS) | a member (mask 2) | an outsider |
|---|---|---|
| 0 (no clan game) | the balance | the balance |
| 1 | Terrorists | SEALs |
| 2 | SEALs | Terrorists |
| 3 (members only) | the balance | refused, code 4 "Closed clan game" (§3.2) |
| 4 (alternate) | SEALs while `DAT_004412d8` is 0, Terrorists once set | the other side |

  Then the placement (D:L161355-161395): a forced side with fewer than 8 takes the joiner (`FUN_002c4940` the SEALs,
  `FUN_002c4730` the Terrorists, their counts `DAT_00441448` / `DAT_00441450`); a forced side that is full refuses
  (code 3, §3.3); no forced side, the balance of research 91 §7 (the Terrorists if they have fewer, or the SEALs hold 8, or
  both are empty; else the SEALs). The side goes back to the joiner in the Game Signal's side byte (1 SEALs, 2
  Terrorists, 3 a spectator) with the swap flag (D:L161450-161458).
- **What it leaves to the services**: nothing. The lobby server (Medius) stores the GF3 the create sent and lists it;
  every clan rule is the host console's. In the port the match server is that host (`gameLobby.ts`'s header), so the
  whole of the table is the server's.

### 4.3 SWITCH TEAMS in a clan game

`IsSwitchTeamsOK` (row 104, 0x277420, a tail to `FUN_002f8ce0` D:L197459-197476) answers 0 for affiliations 1, 2 and 4
and 1 otherwise -- read against `DAT_0044f780`, so the creator's affiliation on the host and the joined game's on a
joiner (§2.2). The GAME LOBBY's script enables SWITCH TEAMS only when it answers 1 and disables it when it answers 0
(`Enable_SM_Launch` and its sequences `SetupSessionMaster` and `SetupNormalJoiner`, `CycleReadyButton`,
`switch_teams_anim`). The host's move itself (`FUN_002c4290` D:L165516-165570) tests only the other
side's count. **The port answers 1 always** (`gameLobbyCommands.ts:791`, "no clan game here (OT.R6)"), and the room's
`PreMatch.switchTeams` has no clan test: in a clan game of affiliation 1, 2 or 4 the button stays live and a switch
undoes the forced side.

### 4.4 Alternate teams: the swap after each full game

- **The scripts**: every console's final screen adds 1 to `ClanSwapSidesIndex` (`dlgMultiplayerFinalReally.rdr`
  `ExitOnStart`); the BRIEFING ROOM's start sets it to 0. In the GAME LOBBY a match returned to (`ComeFromBriefing` 0)
  runs `SwapClanSides`: the session master, with the index at 1, sets it to 0, asks `ClanGameSwapSides(START)`; on 1 it
  sets `mp_locked_game` 1 and reports (`ForceMediusStatusReport`), waits 5 s, asks `ClanGameSwapSides(FINISH)`, re-arms the
  kits for the new side, waits 10 s and while `mp_teams_too_big`, then sets `mp_locked_game` 0 and reports again.
- **The command** (`FUN_0027d540` D:L125956-125999): START answers 1 only for affiliation 4, setting the valve
  `mp_locked_game` (S:0x3ef358) to 1 and calling `FUN_002f8350` (D:L197101-197110: a flag and, on the host, a game update,
  not read further); 0 for any other affiliation (so `SwapClanSides` does nothing there); FINISH calls `FUN_002bada0`
  (D:L160253-160259, "All Switch"): `FUN_002c0040` (D:L162971-162981) flips `DAT_004412d8`, maps the local team word to
  its new side, sends the game's state and republishes the player's state. The team words stay: every player changes
  side together.
- **The port**: no return to the game lobby after a match yet (`gameLobby.ts`'s `READY_GATE_MS_READING`: the 45 s lobby
  "not on the path yet") and no swap flag in the room's roster, so affiliation 4 seats the clan as SEALs every game
  (`CLAN_SWAP_AFTER_GAME_PLACEHOLDER`, §8). Larger than CLAN-JOIN (§9).

### 4.5 The port today

- `assignTeam` (`packages/viewer/src/net/lobby.ts:52`, the room's roster) is the balance of research 91 §7, with no clan
  input; `Lobby.join(..., host?)` takes a preferred side, kept only while it has room (else the balance);
  `Room.hello` passes 'seal' for the host and nothing for a joiner (`room.ts` `hello`, `as.host`).
- The bridge's `join` (`bridge.ts`) holds the game record (`this.lobby.game(id)`: its `genericField3`) and the account
  (`who.accountId`), and the store holds the account's standing clan (`clans.ts` `seatClanTag`'s read) -- every input
  the table needs is on the server already; nothing joins them.
- The page shows a Game Signal refusal only for "Too many spectators" (`GameLobbyCommands.seatEnded`,
  `TOO_MANY_SPECTATORS_TEXT`), carried by the room's `refused` frame (`room.ts` `TOO_MANY_SPECTATORS`).

## 5. The game list's clan filters, the CLAN column and `CLAN_TAGS`

*Masks* (this note's convention since its review, 2026-10-13): the join request's flags are named by the mask the
code ORs in and the host tests -- mask 1 a watch, mask 2 a member (D:L209952-209955, D:L209966-209968; the host
`& 1` and `& 2`, D:L161235, D:L161258). *A correction to research 262 §2.2:* `CLAN_TAGS` is not "an argument a
game-list command compares" (262:117) but the room's PLAYER LIST argument (D:L126119; research 268 §3.4).

- **`FILTER_CLANAFFILIATION`, `FILTER_CLANONLY`** (and `FILTER_BUDDIES`): UI variables `SetFilters` adds and sets to a fixed
  text by its argument ("Clan Affiliation" S:0x3ef260, "Clan Only" S:0x3ef2c8); `SetFilters` is called by no script and no
  code reads the variables (research 265 §2.5, which this re-reads and confirms). Nothing to build; no ONLINE FILTERS row
  stands for a clan filter.
- **The CLAN column**: a full box for a game whose GF3 is non-zero (`FUN_002e2ce0` D:L184459-184464), built on both sides
  (`briefingRoomCommands.ts` `rowCells`, `lobby.ts` `gameListColumns`).
- **AUTOPLAY**: `FUN_002e9940` drops another clan's members-only game from the candidates (research 265 §2.4), built.
- **`CLAN_TAGS`** (S:0x3ef370) is `RefreshRoomPlayerList`'s argument (row 43, `FUN_0027d900` D:L126105-126146: a case-blind
  name test at D:L126119 picks `FUN_002f0ea0`, the visible rows' tags by PlayerInfo, over `FUN_002f11f0`), run by the
  BRIEFING ROOM's PLAYER LIST (`OnPlayerListStart`, `OnPlayerListScrollEnd`). It draws "[tag]" beside the room's players,
  not the games; the port's arm is research 268 §3.4's `ROOM_PLAYER_CLAN_TAGS_PLACEHOLDER` (a shell seam: the box's
  visible rows). Not CLAN-JOIN's.

## 6. `IsClanChallengeGame`

- Row 82 (0x2795d0): `jr ra` / `move v0, zero` -- 0 always, no side effect (research 107 R107.7; the disassembly pinned by
  `tools/test/uiCommandTableDisc.test.ts`; the port's `uiCommands.ts` answers false).
- **No writer, no reader**: there is no variable behind it to set; no script on the disc names it (the byte search of §2.3
  finds it in no archive, and the online dump has no call); nothing in the decompiled code references 0x2795d0; and
  "IsClanChallengeGame" (S:0x3edca0) is the only string in the ELF with "challenge" in it.
- So SOCOM II's "clan challenge" is nothing beyond the CLAN OPTIONS games; Horizon's ClanTeamChallenge family (roadmap
  06's unknown) has no caller on this client. Whether the linked Medius library carries such request builders unused is
  not read (the library's functions carry no name strings); it would change nothing the client does.

## 7. "Requires 100% ready to launch"

- **The rule**: `FUN_002c40c0` (D:L165444-165510) counts the non-spectator seats READY (minor state 2) and answers "all
  ready"; its MP_EIGHTY_READY (S:0x3f2a40) needs no countdown running, not all ready, both sides seated, 80% ready **and
  `FUN_002e99e0()` 0** (D:L165503-165507). So in a game of affiliation 1..4 the launch comes only from the all-ready
  launch (D:L165379-165384) or the host's `ForceMPLaunch` (`FUN_0027d070` D:L125792-125812, which tests no affiliation).
- **The port**: built by CLAN-EIGHTY -- `PreMatch`'s `clanGame` from `isClanGame(genericField3)` (`gameLobby.ts`;
  `gameLobby.test.ts`'s "a clan game raises no 80% countdown"). Nothing for CLAN-JOIN.
- **The caption**: roadmap 05 N10 quotes "Requires 100% ready to launch" with the CLAN OPTIONS row, whose captions are
  #264 (affiliation 0), #265, #267, #269, #271 (1..4, `ClanAffiliationDesc`) and the help lines #266, #268, #270, #272
  (`FiddleClanAffiliation`, `DescriptionText`). Research 91 §7 quotes the four names ("Terrorist team", "SEAL team",
  "Members only", "Alternate teams") against UIMnLOC 264-272 without the ids one by one. Which caption carries the
  sentence, and the exact words of the nine: **owed** (`tools/dump-online-dialogs.ts --dialog dlgCreateGame.rdr`).

## 8. Placeholders and readings

Proposed for CLAN-JOIN; none is in code yet, so each is *note only* until the build carries it (the ledger's rule).

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `CLAN_SIDE_MEMBERSHIP_READING` (proposed: server, beside the side rule) | `'the account\'s standing clan in the server\'s store when the seat is taken'` | the joiner console's own test, its GetMyClans copy `DAT_0044f59c` against the GF3's clan id (mask 2 of the join request, `FUN_0030d380` D:L209952-209955). They differ when a member's clan changed after his last GetMyClans (a quit, a removal, a disband) -- his console still claims the old clan -- the same gap as research 275's `CLAN_TAG_AT_SEAT_READING` | ONL-32's transcript of a two-clan game joined by a member removed from the clan after his last GetMyClans | in code since CLAN-JOIN (server `gameLobby.ts`; reading, pending review) |
| `CLAN_SWITCH_CLOSED_READING` (proposed: server `gameLobby.ts`, `PreMatch.switchTeams`) | `'refused for affiliations 1, 2 and 4'` | the GAME LOBBY's screen rule (`IsSwitchTeamsOK`, `FUN_002f8ce0` D:L197459-197476) kept by the room, as `SWITCH_CLOSED_AT_COUNTDOWN_READING` keeps the countdown's: the console's host move (`FUN_002c4290` D:L165516-165570) has no clan test and trusts the screen; here the room is the host and a page may be modified -- an adaptation of where the rule is kept, not of the rule | -- (the page side is a transcription; the room's copy is the adaptation's) | in code since CLAN-JOIN (server `gameLobby.ts`; reading, pending review) |
| `CLAN_CLOSED_WATCH_READING` (proposed: server, the side rule) | `'a watch is admitted by the room; the page refuses it with #524'` | the host's clan block runs for a player's join only (`FUN_002bc620` D:L161256-161258); the client's `aux_join_game` refuses a non-member's watch of a members-only game first (`ClanGameClosed` before `JoinAsSpectator` is read). The room admits the watch as the host does; an unmodified page never sends it | ONL-32's transcript of a non-member's WATCH of a members-only game (the #524 popup, no request) | in code since CLAN-JOIN (server `gameLobby.ts`; reading, pending review) |
| `CLAN_SWAP_AFTER_GAME_PLACEHOLDER` (proposed: server, the side rule) | `'never swapped: affiliation 4 seats the clan on the SEALs\' side every game'` | `SwapClanSides` / `ClanGameSwapSides` after each full game (§4.4; "All Switch" is a dead registered message, not the swap -- research 309 R309.5): `DAT_004412d8` flipped by the host in the GAME LOBBY a match returned to, every player changing side, later joiners following the flag | the return-to-lobby path (the 45 s lobby) built, then the swap transcribed (§9's flagged item); ONL-32's two-game transcript of an "Alternate teams" game | in code since CLAN-JOIN; retired by CLAN-SWAP (2026-10-14; research 309 §8, `CLAN_SWAP_FLAG_PER_GAME_READING`) |
| `NOT_ON_CORRECT_CLAN_TEAM_UNCALLED_READING` (note only) | -- | row 103 has no caller on the disc (§2.3) and its rule disagrees with the host's placement in affiliations 3 and 4 (§2.4); the port may keep the row declared, or transcribe the body with no caller | `tools/dump-dialogs.ts --json`: the name in no set's commands (the reader's confirmation of the byte search) | *note only* |

The names this note leans on are listed where they live: `ROOM_PLAYER_CLAN_TAGS_PLACEHOLDER` (research 268 §3.4),
`SWITCH_CLOSED_AT_COUNTDOWN_READING` and `EIGHTY_READY_FRACTION_READING` (server `gameLobby.ts`), `CLAN_TAG_AT_SEAT_READING`
(research 275 §3).

## 9. What CLAN-JOIN builds

The smallest set, each with its failing test first. **About 3 points**; the swap (item 6) is flagged as larger and left
out.

1. **The side rule, server-side, as one pure function** (beside `isClanGame` in `packages/match/src/gameLobby.ts`):
   `clanSide(genericField3, accountClanId | null, watch)` -> `{ side: 'seal' | 'terrorist' | null } | { refused: 'Closed
   clan game' }` over §4.2's table (affiliation from the top nibble 0xA..0xD, the clan id from the low 28 bits; a member
   when the account's standing clan equals it; the swap flag taken as 0, `CLAN_SWAP_AFTER_GAME_PLACEHOLDER`; a watch never
   refused, `CLAN_CLOSED_WATCH_READING`), and the host's side (Terrorists for affiliation 1, else SEALs).
   *Test first* (`packages/match/test/clanSides.test.ts`, new): the 5 x 2 table, a watch of affiliation 3 admitted, a
   clanless account an outsider, GF3 0 no rule, the host's side for 0..4.
2. **The bridge and the room seat by it**: `GameBridge.join` reads the account's standing clan (the store's
   `account(id).clanId`, not disbanded -- `seatClanTag`'s read) and the game's `genericField3`, refuses "Closed clan game"
   before the seat (`refuse(...)`, so the page gets the `refused` frame), and hands the forced side to `Room.hello`
   (`as: { host, side }`); `Lobby.join` (`packages/viewer/src/net/lobby.ts`) takes a **forced** side distinct from the
   host's preference: full -> no seat, the room refusing "Too many players" (§3.3). The host's own hello takes the host's
   side of item 1 (replacing the fixed 'seal'). `CLAN_SIDE_MEMBERSHIP_READING`.
   *Test first* (`packages/central/test/bridgeClanSides.test.ts`, new, over the fixtures' MP72 like `bridgeClanTag.test.ts`;
   skips without them): a lobby-created affiliation-1 game -- the host and a member on the Terrorists, an outsider on the
   SEALs; affiliation 3 -- an outsider's join refused with "Closed clan game", a member seated, an outsider's watch seated;
   affiliation 2 with the SEALs at 8 -- a member refused "Too many players"; GF3 0 -- the balance unchanged. And a
   `Lobby.join` unit case for the forced side full.
3. **SWITCH TEAMS closed in affiliations 1, 2, 4, both ends**: the page's `IsSwitchTeamsOK` answers `FUN_002f8ce0` over the
   held game's affiliation (the host: `createdClanField`; a joiner: the joined entry's `genericField3`), replacing the
   constant 1 (`gameLobbyCommands.ts:791`); the room's `PreMatch.switchTeams` refuses the same three
   (`CLAN_SWITCH_CLOSED_READING`; `PreMatch` already takes `clanGame`, it needs the affiliation).
   *Test first*: `packages/ui/test/screens/` (the answer for GF3 0, 0xA.., 0xB.., 0xC.., 0xD..; host and joiner) and
   `packages/match/test/gameLobby.test.ts` (a switch refused in 1, 2, 4, allowed in 0 and 3).
4. **The joiner's refusal texts**: `GameLobbyCommands.seatEnded` posts MP_EJECT_SPECTATOR with the refusal's text for the
   Game Signal's texts it can now receive -- "Too many players" and "Closed clan game" beside "Too many spectators"
   (`FUN_002b9150` D:L159206-159227) -- exported constants beside `TOO_MANY_SPECTATORS_TEXT`, the server's beside
   `TOO_MANY_SPECTATORS`. The `refused` frame is the existing one: additive, **no protocol bump**.
   *Test first*: the ui test that a refusal "Closed clan game" posts MP_EJECT_SPECTATOR with that text (and the BRIEFING
   ROOM's `spectator_rejected` runs over the machine, as SVC-23f's test does for "Too many spectators").
5. **The row and the docs**: row 103 stays declared with its no-caller reading recorded (or its body transcribed as a pure
   function with a unit test, no caller -- the implementer's choice, under half a point); the roadmap 06 SVC-11 block's
   stale "Today" corrected (`assignTeam` is `packages/viewer/src/net/lobby.ts`'s; ClanGameClosed, the CLAN column,
   AUTOPLAY's test and the 80% rule are built).
6. **Flagged, larger than 3 points, not CLAN-JOIN's**: "Alternate teams" (§4.4) -- it needs the GAME LOBBY a finished
   match returns to (the 45 s gate, the lobby's re-entry, `ComeFromBriefing` 0), then `ClanGameSwapSides` (START's
   `mp_locked_game`, FINISH's All Switch), a swap flag in the room's roster that `sideOf` and the placement read, and the
   kits re-armed for the new side. A row of its own.

Not in the set: `CLAN_TAGS` (research 268 §3.4, a shell seam), the filters (dead), `IsClanChallengeGame` (built), the
100% rule (built), the players' total refusal at `MaxPlayersValve` (§3.3's aside).

## 9a. What CLAN-JOIN built (2026-10-13; reading, pending review)

Appended by CLAN-JOIN's implementer; §9's items 1-5, item 6 left out as flagged.

- **Item 1**: server `gameLobby.ts` -- `clanAffiliation` / `gameClanId` (`FUN_002e9ab0`), `clanSide` (§4.2's table,
  the four constants of §8 made real), `hostClanSide` (`FUN_002c5450`), `switchTeamsOk` (`FUN_002f8ce0`);
  `packages/match/test/clanSides.test.ts`.
- **Item 2**: the bridge's `join` reads the account's standing clan (`clanOf`, `seatClanTag`'s read) and the game's GF3,
  refuses "Closed clan game" before any seat (`CLOSED_CLAN_GAME`, server `room.ts`) and hands the side to the room
  (`GameSeat.side` -> `Room.hello`'s `as.side`); `Lobby.join`'s `forced` side, full -> `TOO_MANY_PLAYERS`; the host's
  own side by `hostClanSide`. `packages/central/test/bridgeClanSides.test.ts` (MP72), `packages/viewer/test/netLobby.test.ts`.
- **Item 3**: `PreMatch` takes the affiliation and refuses SWITCH TEAMS in 1, 2 and 4 (`'clan'`); the page's
  `IsSwitchTeamsOK` answers over the held game's affiliation (`clanAffiliationOf`). `gameLobby.test.ts`,
  `packages/ui/test/screens/clanJoin.test.ts`.
- **Item 4**: `TOO_MANY_PLAYERS_TEXT`, `CLOSED_CLAN_GAME_TEXT` posted with MP_EJECT_SPECTATOR (`seatEnded`); no protocol
  bump. `clanJoin.test.ts`, `gameLobbyScreen.test.ts` (the briefing room's `spectator_rejected` over the machine),
  `gameLobbyHost.test.ts`.
- **Item 5**: row 103 stays declared (R308.1, `NOT_ON_CORRECT_CLAN_TEAM_UNCALLED_READING` note only).
- **Not built, found at the build**: a queued player (the players' total full, §3.3's aside) promoted later is placed by
  the balance, not by the clan rule -- the original refuses at the total (code 3) and has no queue, so the queue's
  promotion is the older deviation's, not a new one.

## 10. What is left

- **Captions to dump** (`tools/dump-online-dialogs.ts`): #524 (`--dialog dlgMPBriefingRoom.rdr`); #264-#272 and which of
  them says "Requires 100% ready to launch" (`--dialog dlgCreateGame.rdr`); #527 and #364 for the refusal's popups are the
  existing SVC-23f path's.
- **The reader's confirmation of the two absences** (`tools/dump-dialogs.ts --json`): `NotOnCorrectClanTeam` and
  `IsClanChallengeGame` in no set.
- **Not read here**: `FUN_002f8350`'s host update (D:L197101-197110) and the meaning of `mp_locked_game` beyond the
  swap's window; `FUN_002c4940` / `FUN_002c4730`'s slot choice (research 91 §7's team slot); the late joiner's path under a
  clan rule (the same handler, the same placement).
- **The proven level**: ONL-32's two-clan transcripts -- the #524 popup, the host's "Closed clan game" and "Too many
  players" refusals, each affiliation's sides, SWITCH TEAMS greyed in 1, 2, 4, and the "Alternate teams" swap after a full
  game (roadmap 06 SVC-11's acceptance).
