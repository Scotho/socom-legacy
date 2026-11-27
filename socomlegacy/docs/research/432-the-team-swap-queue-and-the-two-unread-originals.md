# 432 -- The team swap queue (WM-51, WM.R21) and the two originals it sits on

- Date: 2026-11-15. Branch `agent/wm-swap-rules`, base `origin/agent/next` 42202397c2; the weekend plan's row WM-51,
  the owner's ruling WM.R21 (the team swap queue: a DEPARTURE from the original, built on his word).
- Track: simulation (departure, WM.R21). Status: **reading, pending review** -- sections 1 and 2 are source inspection
  of the r0001 decompilation (`socom2_game.elf.decomp.c`, cited `FUN_<addr>` and `D:L<line>`) and of the disc's
  dialog scripts through the repository's readers (`tools/test/onlineDialogs.pinned.json`, `P:L<line>`, and
  `tools/dump-dialogs.ts --dialog dlgGameLobby.rdr --tree`, run on Shadow PC 1 with `SOCOM_DISC` present). A fresh
  reviewer's re-read at the source is owed. **Nothing here is measured on the original running.**
- Evidence kinds, kept apart: **(D)** source inspection of the decompilation; **(S)** the disc's dialog scripts read
  through the repository's readers; **(U)** unit tests of the port; **(O)** the original running -- none.
- New names: `SWAP_QUEUE_OWNER` (the ruling), `SWAP_QUEUE_COUNTDOWN_RULED`, `SWAP_QUEUE_READY_RULED`,
  `SWAP_QUEUE_REPEAT_RULED` (the controller's three rulings under it, the owner's to overturn), `SWAP_QUEUE_ANSWERS`
  (the wire's two new `refused` values), all in match `src/gameLobby.ts`. They are rulings and names, not readings or
  placeholders: no ledger entry. No `*_READING` or `*_PLACEHOLDER` is added or changed.

## 0. The answers

1. **What the original answers an asker refused for a full side: nothing** (D; section 1). The host's move tests the
   far side's count against 8 and, when it is full, does nothing; the message back to the asker is sent only on a
   move. The asker's own screen ends its wait on its own clock (`switch_teams_anim`'s `CountButtonFiveST`).
2. **Whether READY disables (greys) SWITCH TEAMS in a fresh lobby: yes, once the seat presses READY there** (S;
   section 2). READY's `ready_anim` first stops `switch_teams_anim` (whose own re-enable would otherwise reopen the
   button), then its script `CycleReadyButton` disables `Glswitchteams` when the seat becomes READY and enables it again
   only on the way back to not ready, after its 5 s, and only where `IsSwitchTeamsOK` answers 1 and the seat is not a
   spectator. So a player who pressed READY cannot press SWITCH TEAMS on an unmodified screen; the port's page runs the
   same script. The button is greyed, not hidden, and no dialog closes; the host itself tests no READY. Whether this
   holds at a lobby's entry or return as well is **unread**: the entry enables the button on `IsSwitchTeamsOK` alone
   (section 2), so it holds there only if the minor state is not 2 (READY) on entry, and no script writes that state.
3. **What the port lays over them** (section 3): the owner's queue (WM.R21), one constant away from the original's
   switch: the original's refusal (`sides`) stands wherever the queue is off -- the Forge's lobby, and every
   `PreMatch` built without the flag.

## 1. The original's refusal (D, reading)

- **The press.** `SwitchSides` (`FUN_0027d100` D:L125816-125831, once per 5 s, `SWITCH_REPEAT_MS_READING`) calls
  `FUN_002badd0` (D:L160265-160285): on a client (`DAT_0045a0c0` 0) it sends the host a game-session message
  (`FUN_0030cef0(0x45a0c0, 0x40, ...)`, D:L160274-160276: the client test at 160274, the send at 160276); on the host
  it runs the move on its own slot at once (`FUN_002c4290`, D:L160279-160281).
- **The host's handler.** `FUN_002bae70` (D:L160288-160296) calls `FUN_002c4290` with the sender's slot and answers 4.
- **The move.** `FUN_002c4290` (D:L165518-165570) first calls `FUN_002c4440` (D:L165533) on every request -- per the
  second read (seat 8f), a recount that stays on the host, can fire the host's variable listeners, and posts
  `dlgNetAbandoned` on the host when both sides are empty (its body not re-read here). Then: with the slot on the SEALs'
  word and the TERRORISTS' count (`DAT_00441450`) under 8 it takes the slot over and calls `FUN_002baea0`; else with the
  slot on the TERRORISTS' word and the SEALs' count (`DAT_00441448`) under 8, the same the other way; **else nothing
  sent and no seat moved**. The side names of the two counts (`DAT_00441448` the SEALs', `DAT_00441450` the
  TERRORISTS') hold for one value of the swap flag `DAT_004412d8` only; with it flipped ("Alternate teams", CLAN-SWAP)
  the words' sides exchange.
- **The answer.** `FUN_002baea0` (D:L160302-160320) is called only from those two move branches: to the host's own
  slot it applies the change at once (`FUN_002baf30`), to any other it sends the change (`FUN_0030cef0`). So an
  asker whose far side is full is told nothing.
- The port's room answers such an asker `refused: 'sides'` (bridge `request`, game `request`): the original's state
  (nothing moves) with an answer it does not send -- the page's wait end (ui `gameLobbyCommands.ts`'s
  `switchAsked`, OT.R129) is built on it. Unchanged by this note.

## 2. READY and SWITCH TEAMS (S, reading)

- `PlayerReady`'s CROSS runs `ready_anim` -> `ReadyToLoad`, then `CALL CycleReadyButton` (the `--tree` dump's
  bindings). `ready_anim` runs `STOP switch_teams_anim` (P:L7431) before `ReadyToLoad` (P:L7433): without it,
  `switch_teams_anim` (P:L7588-7630) would re-enable the button after its own `WAIT 5` -- that re-enable
  (P:L7624-7627) tests `IsSwitchTeamsOK` and `mp_x_sec_clock > 0`, not READY -- and reopen SWITCH TEAMS under READY.
- `CycleReadyButton` (`tools/test/onlineDialogs.pinned.json` P:L7390-7425, at 84f6940bf0): `IF mp_minor_game_state ==
  2` (READY) -- `DisableButton(PlayerReady)`, `DisableButton(Glswitchteams)`, `DisableButton(weaponselect)`, the 5 s
  count, `WAIT 5`, then READY enabled again; SWITCH TEAMS and ARMORY stay disabled. `ELSEIF mp_minor_game_state ==
  1` (not ready) -- the 5 s count, `WAIT 5`, READY enabled, then `IF player_team == 16` (a spectator) nothing, `ELSE`
  `IF IsSwitchTeamsOK(NA)` `EnableButton(Glswitchteams)`, and `EnableButton(weaponselect)`.
- The script tests no "lobby a match returned to": a READY press disables (greys) the button in the first entry's
  lobby and the returned one alike. The lobby's entry, though, enables SWITCH TEAMS on `IsSwitchTeamsOK` alone, with no
  READY test (`SetupSessionMaster` P:L7225-7227, `SetupNormalJoiner` P:L7279-7281), so a READY seat has no SWITCH TEAMS
  at an entry or a return only if `mp_minor_game_state` is not 2 then. No script in the pinned set writes it (only reads,
  P:L7391, P:L7405, P:L7660; P:L8148 is the valves list), so where the code resets it is **unread**. Settles it: the
  decompilation's writer of the minor state (the slot record's +0x41) at the lobby's entry and at a match's return, or a
  capture of a READY seat's lobby after a match's return.
  The room does not refuse a READY seat's switch (`SWITCH_CLOSED_AT_COUNTDOWN_READING`'s note: "A seat already READY
  has its button disabled too ... the page's script; the room does not refuse that one"); this note does not change
  that.
- Why it matters to WM.R21: the owner's rule 3 ("READY ends a queued swap") and the controller's ruling (b) (a press
  while READY does not queue) agree with the screen: a player who pressed READY has no SWITCH TEAMS to press (at an
  entry or a return, unread: above).

## 3. The ruling laid over them (WM.R21; the plan's row WM-51)

The owner's words (INTAKE sections 42, 43, 56, verbatim in the lane's brief) as eight rules, and the controller's three
rulings, each named in `gameLobby.ts`:

| rule | the port | the original (sections 1, 2) |
|---|---|---|
| 1 a press at a full far side | the asker queued, answered `refused: 'queued'` | nothing moves, nothing sent |
| 2 a second press | the ask cancelled, `refused: 'unqueued'`; a third queues at the back | -- |
| 3 READY | ends the seat's ask | READY disables SWITCH TEAMS (section 2) |
| 4 the mark | every page told: `queued: true` on the queued seat of each `gameLobby` (central `bridge.ts` `tell`, match `game.ts` `tell`, 86a8896390), absent otherwise; drawn by the page from that field only (`SWAP_MARK_ADAPTATION`, below) | -- |
| 5 both sides queued | the oldest ask of each side trades at once (`Lobby.tradeTeams`, `Room.tradeTeams`), the counts kept | -- |
| 6 a seat freed | the oldest ask for that side moves at once, before the bots refill; the spectators' join queue (`Lobby.leave`'s promotion) goes first | -- |
| 7 the ends | its switch, its cancel, the launch (`markLaunched`); a reopened lobby holds none; a seat that leaves or watches takes its own | -- |
| 8 clan games | affiliations 1, 2, 4 refuse `clan` (`CLAN_SWITCH_CLOSED_READING`); 3 and 0 queue | `IsSwitchTeamsOK`, bound in the pinned set to `FUN_00277420` (P:L8009), which the decompilation does not hold; per the second read's disassembly of 0x277420-0x277428 (seat 8f, not re-read here) it tail-calls `FUN_002f8ce0` (D:L197459-197476) with a0 = 0x44f370 |
| (a) countdown | an ask stands; nothing moves under it; a press under it is refused `countdown`; called off, the queue runs | `SWITCH_CLOSED_AT_COUNTDOWN_READING` |
| (b) READY press | never queues: `sides` at a full far side, a normal move otherwise | section 2 |
| (c) the 5 s | binds queue and cancel presses alike in a lobby no match returned to | `SWITCH_REPEAT_MS_READING` |

The one case where rule 6 does not hold at once: a queued spectator waiting to join takes a freed seat before a queued
switcher (the controller's ruling, 2026-11-15; pinned in match `test/swapQueue.test.ts`). As far as read a game's join
at full sides is refused by the services ("Too many players"), so that queue is normally empty in a game's lobby.

For the owner: a queued asker cannot cancel while the launch countdown runs (every press under it is refused
`countdown`, ruling (a)), and if the countdown is then called off the queue moves the asker without a fresh press.

The wire (the controller's word under WM.R11, 2026-11-15): `queued?: true` on each `gameLobby` seat and the two
`refused` values, additive JSON, `PROTOCOL_VERSION` (17) unchanged by this lane. Both are on the wire (WM-51 task 3,
`agent/wm-swap-screen` 86a8896390): the asker's `refused` (`queued` on a queue, `unqueued` on a cancel; in the existing
string field because a page without the feature ends its switch's wait only on a `refused` or a side move) and the seat
field to every page, so every seat sees every queued seat's mark, own and others', both sides. An older server sends no
field and answers `sides`: the page draws no mark and holds no queued belief of its own. The Forge's lobby
(`forgeGame.ts`) builds no queue (its `PreMatch` is built with the flag off) and its seats list carries no `queued`.

The page (WM-51 task 3; ui `screens/swapMark.ts`, `gameLobbyCommands.ts`, `lobbyRecovery.ts`; adaptations of the
ruling's page, reading, pending review):
- **The mark** (`SWAP_MARK_ADAPTATION`): a queued seat's ready-dot cell (the side list's third column, POSITION -1,
  8 x 8, TOP_OFFSET -15; research 269 §4.4) drawn as two disc textures stacked, `arrow_top.tif` over `arrow_botm.tif`
  -- the up and down pair the ladder screens name `arrow_up` / `arrow_dwn` (`tools/test/onlineDialogs.pinned.json`
  P:L11897-11898 dlgLadderLobby, P:L12127-12128 dlgClanLadderLobby) -- each the dot's width and 7 tall, meeting at the
  dot's middle; the dot not drawn for that row. The dot's cell because a queued seat is never READY (ruling (b);
  section 2) and the row has no free room right of the medal. Built by a dialog-lookup wrapper (`withSwapMark`) that
  adds two IMAGE columns and three blank dot textures, so on the disc's own design a queued row draws today's dot. Which
  way each texture's pixels point is by the names, to be confirmed from the pictures
  (`viewer/e2e/swapMarkPicture.spec.ts`). SWITCH TEAMS is not extended and gains no text.
- **A queued move that lands later** (a freed seat, or the other side's queued press, after `switch_teams_anim`
  P:L7588-7630 has run out -- the disc never re-arms the kit for it): the page runs that animation's END alone
  (`lobbyRecovery.ts` `switchTeamsEnd`: the animation started and its sequences entered past `WAIT 5` P:L7602, as
  `FUN_0026ae20` D:L115457-115509 sets them up), so the kit is armed for the side now held (P:L7603-7628) with no
  `SwitchSides` and no second `switchTeams`. A `switch_teams_anim` still alive is left to its own end. Not while the
  launch countdown runs (`CountDown` locks SWITCH TEAMS; the end's re-enable P:L7624-7627 would open it): owed until the
  call-off or the launch. At the launch, still owed (the seat on the ARMORY, where the recovery cannot run), the end's
  no-record branch is written at once (P:L7610-7618: `UiCharSet` 15 / `MpCharSet` 1 for the SEALs, 240 / 5 for the
  Terrorists); its record branch (`EquipCharacterProfileSeal/Merc`, P:L7603-7609) is not run there. The match's kit
  itself comes from the side's record or default: the page's ARMORY choice is forgotten at a side change (viewer
  `gameLobbyHost.ts`, ARMORY-SAVE), so, as read (not run), a stale type in the lobby's valves does not reach the spawn.
- **The ARMORY** (R4B-08's "Team Switch Error!", research 379 §3): not shown for the seat's OWN queued move (its last
  view `queued`); every other move as research 379 §3 has it.

## 4. What would make these proven

- Section 1: a two-console capture (PCSX2 r0004, or the original on hardware through a DNAS-free server) of a client's
  SWITCH TEAMS at 8 v 8, the game-session traffic recorded: no message back from the host.
- Section 2: a capture of a READY player's lobby, SWITCH TEAMS greyed (`DISABLED`, text colour 50,50,50) until the
  seat un-readies and 5 s pass.
