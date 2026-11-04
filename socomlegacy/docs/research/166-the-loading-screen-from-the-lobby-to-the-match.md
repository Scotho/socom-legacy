# 166 -- The loading screen from the game lobby to the match: the hand-off on the same client, the round's clock, the way back (ONL-18)

Written 2026-10-05 for ONL-18 (`../roadmap/05-online-front-end.md` "ONL-18"), wave 5 of sprints 16 and 17 on the online
path's plan (`../plans/2026-10-02-online-path-target.md`, OT.R19, OT.R25, OT.R27; the waves table's `loading` row,
which reserved this number -- the task's brief said 167, which the same table gives the ARMORY's wave). Sources: the
retail decompilation `socom2_game.elf.decomp.c` under `SOCOM_PC_ROOT` (`D:L<n>` its line, `FUN_<addr>` its functions;
cited, never pasted); research 125 (the loading screen, PR #10's hold), 165 (the lobby and its hand-off
`GAME_LOBBY_MATCH_START`), 159 (the bridge: the launch, the closes), 157 §6 (`socketHolds`), 91 §1 and 87 §8 (the
round's clock and banner), 179 §6.18 and §6.22 (the return to the lobby; the load barrier), and does not restate them.
**No server was contacted** (R293); no game was run; no browser was run (the host was another session's).

The code: `packages/viewer/src/lobbyMatch.ts` (`LobbyMatch`: the load, the hold, the match's start, the clock, the
closes, the way back; `missionMapPath`, `pageLobbyMatchScreen`), `net/client.ts` (`rebind`), `netPage.ts`
(`NetPageDeps.game.adopt`), `gameLobbyHost.ts` (`GameSocketHost.adopt`), `frontEnd.ts` (the session's `match`, the
hand-off into it, `sessionGone`, the mount's ports). The tests: `packages/viewer/test/lobbyMatch.test.ts` (a real
`GameSocketHost` over a fake socket makes the hand-off), `matchHandOff.test.ts` (`rebind`, `adopt` on both sides),
`frontEndMatch.test.ts` (the page's session, the game lobby review's two findings). Confidence: **reading, pending
review** for every transcription; nothing is measured against the original running (§6). ONL-18c's match in the page
(`matchMount.ts`, `test/matchMount.test.ts`) is §8.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R166.1 | **The match runs on the lobby's own client**: the hand-off's open `NetClient` is shown the loading screen, the map's load begun, and handed to the match (`NetPage` adopts it: no second socket, hello or ticket), the lobby's events so far replayed, its walk rebound with the room's last spawn; `socketHolds` stays true from the lobby's welcome to the match's last close | research 165 §4; research 157 §6 | §1 |
| R166.2 | **The original's only countdown before a match is the lobby's** (`CountDown`, #354 / #355, ONL-16a's); `dlgLoad.rdr` draws none and the round starts with none ("No countdown and no freeze", A_ready021): the first frame of the round posts "STARTING ROUND %d OF %d" and the clock reads remaining = length - (now - start) in whole seconds | `FUN_002a7d40` D:L149755-149758 -> `FUN_001fb420`; `FUN_002aa490` D:L151100-151109; `FUN_002a6ad0` D:L148973-148993 | §2 |
| R166.3 | **A slow loader holds everyone in the original**: each loader reports itself loaded (minor state 2), the host's load completes only when every launched non-spectator has (`FUN_002c4020`) -- it writes `+0x112` = 2 and sends it at once -- and every client's load completes on that byte, about 0.5 s before the host's round start sets game state 3 (corrected 2026-10-14 by LOAD-HOLD from research 322 (agent/parity-2 0d2d69644) §1.1, `CLIENT_ROUND_WAIT_READING`; was: "its round start sets game state 3, which every client's load waits on") -- no countdown runs out. Our room started round 1 at the launch, so the page joined the running round late (`SLOW_LOADER_PLACEHOLDER`); since ONL-18b (2026-10-06, research 221) the room holds a launched game's round 1 for every seat's `loaded`; since LOAD-HOLD (2026-10-14) the page sends `loaded` when its assets are in and holds its loading screen until that round 1 starts (or its welcome shows a round under way); since ROUND1-COUNT (2026-10-14) the room starts round 1 the host's 0.5 s after its barrier (`ROUND1_AFTER_BARRIER_S_READING`) and the page counts its own 0.5 s from its assets, so it leaves the screen as round 1 starts | `FUN_001f5e70` D:L55693-55707, D:L55748-55755; `FUN_002c4020` D:L165414-165441; `FUN_002c5360` D:L166181-166213; `FUN_002c00f0` D:L163083-163084; `FUN_002c0850` D:L163415-163416; `FUN_002a7d40` D:L149762 | §3 |
| R166.4 | **The way back is the load state's**: a close for good writes the next dialog into the menu state's start dialog -- `dlgNetAbandoned.rdr` (#528) for the game's end, `dlgNetError.rdr` for a net failure -- and the match's end returns to the same game's lobby, still connected | `FUN_001f5e70` D:L55710-55745; `MPZANIM.ZAR` `call_gamelobby` / `return_to_gamelobby` (research 179 §6.18) | §4 |
| R166.5 | **The input hold is PR #10's**: `LoadingJoin` over the hand-off's lanes (the assets, the client's state), its 0.5 s completion, and no input until the round runs | `FUN_001f5e70` D:L55748-55762; research 125 §8 | §1 |

## 1. The hand-off on the same client (R166.1, R166.5)

`GameSocketHost.handOff` (research 165 §4) gives the open client, the game, the first mission, the ticket, the lobby's
`welcome` and `roundStart`, with `held: true`: the host stops listening without telling the lobby's client anything,
so the session stays held. The front end's session hands it to its `LobbyMatch` (`frontEnd.ts`; before ONL-18 the
default only logged it, leaving an open client with no listener -- the game lobby review's finding 1). `LobbyMatch.start`
listens to the client at once and keeps every event (`LOBBY_MATCH_EVENTS_ADAPTATION`, at most 1024), shows the loading
screen for the mission and starts its load (`pageLobbyMatchScreen`: PR #10's panel covers at once and draws the map's
own `dlgLoad` once `loadingFromDisc` has read it -- one module for every map, OT.R25 (a); the map's archive read while
it shows, `LOBBY_MATCH_ASSETS_ADAPTATION`). Each frame the lanes go to PR #10's `LoadingJoin` -- the scene lane is the
load, the connection the client's state (open is `online`: the welcome came in the lobby) -- whose release is the
original's 0.5 s completion (`FUN_001f5e70` D:L55748-55762); a failed load counts as done, as PR #10's failed warm-up.
Then the screen goes and the match starts on the same client: `NetPageDeps.game.adopt` makes it `NetPage`'s first
client (no `open()`, no second hello or ticket), rebinds it to the match's walk (`NetClient.rebind`: the idle walk's
tap off, the match's on, locked until the room stands the mover, and a spawn the room made during the load stood on
it), and replays the lobby's events, the welcome first. `NetPage` is told the session is held (`held` true) and tells
`holds(false)` at its close; a drop after it opens a new socket as any. The hold of input (`LobbyMatch.blocked`) stands
through the load and until the round runs (the hand-off's `roundStart`, or one that comes after).

## 2. The countdown (R166.2)

Read where the original counts before a match: the game lobby's `CountDown` draws "GAME STARTS IN n SECONDS" from
`mp_x_sec_clock` (research 165 §2, ONL-16a's), then `check_loop` switches to the load screen. `dlgLoad.rdr`'s nine
objects carry no number (research 125 §1) and its scripts (`SpinLoadingCD`, `OnMenuStart`, `load_complete`) draw none.
The round has none either: the load cuts into play (A_ready020 -> A_ready021, research 91 §1), and the round's start
is `FUN_002a7d40`, called from `FUN_001ec480` D:L50946 beside the core state's tick (and D:L51049, D:L75935), which
on a network game posts the banner through `FUN_001fb420` (D:L149755-149758, research 87 §8) and, on the host, sets
game state 3 (D:L149762). The clock it then shows counts from the round's start: remaining = length - (now - start),
floored at 0 (`FUN_002aa490` D:L151100-151109), drawn in whole seconds (`FUN_002a6ad0` D:L148973-148993); A_ready021's
first frame reads 05:59. So the page draws the round's clock from the server's time: `LobbyMatch.roundClock` counts
the room's `roundStart` length from its arrival (or the hand-off's, when it came in the lobby), and each `score`'s
`timeLeft` sets it again -- `ROUND_EPOCH_PLACEHOLDER` (protocol 10 now carries the epoch and `startTick`; since the
load barrier the arrival is the start within one trip of the socket for every page loaded in time, research 221 §5).

## 3. The slow loader (R166.3)

The original waits. In the load state's network branch (`FUN_001f5e70`), a loader whose load is done writes its minor
state 2 and reports its slot (D:L55699-55702; `FUN_002c5360` copies +0x114 / +0x115 into the slot's +0x40 / +0x41,
D:L166181-166213); the host, while its +0x112 is 1, asks `FUN_002c4020` (D:L165414-165441: no slot that is not a
spectator's, flag 0x10000, has major 2 with minor not 2), then sets +0x112 to 2 (D:L55693-55694) and sends its game
object at once (D:L55694-55696; +0x112 packed with +0x113 by `FUN_002c00f0` D:L163083-163084, unpacked by a client's
`FUN_002c0850` D:L163415-163416); every console's load completes on +0x112 2, or +0xcc clear and game state +0x113 3
(D:L55704-55707), then counts its 0.5 s (D:L55748-55755) -- so a client completes on the host's barrier, about 0.5 s
before the host's round start writes game state 3 (D:L149762), whose test is then not the one taken (corrected
2026-10-14 by LOAD-HOLD, from research 322 (agent/parity-2 0d2d69644) §1.1, its review's F1; that a client takes the
+0x112 path and not its +0xcd one, D:L55684-55685, is `CLIENT_ROUND_WAIT_READING`; was: "its own load completes on
+0x112 2, and a client's on game state 3 (D:L55704-55707), which the host's round start writes (D:L149762)"). Every
page holds its loading screen until the slowest launched player is in; research 179 §6.22 read the same barrier. Our room starts round 1 at the launch (SVC-07a: `PreMatch` is launched when the room starts round 1), so
a page that loaded late joined the round in play, its clock run down (`SLOW_LOADER_PLACEHOLDER`). **Built by ONL-18b
(2026-10-06, research 221):** protocol 10's client event `loaded`, sent once when the loading screen releases (both
`LobbyMatch` and `/testroom`, through `LoadingJoin`), and the room's round 1 of a launched game held until every seated
player has sent it (spectators not waited for), at most the server's ceiling (`LOAD_BARRIER_TIMEOUT_PLACEHOLDER`, a
server adaptation: the original's load has no timer); `SLOW_LOADER_PLACEHOLDER` is retired.

**The page's half, LOAD-HOLD (2026-10-14, research 322 (agent/parity-2 0d2d69644) §4.1 B1; reading, pending review).**
ONL-18b left the front end's screen releasing on the page's own load plus 0.5 s, `loaded` sent at that release, so the
page mounted the match and drew it -- the type's default kit, the clock at the model's 06:00, a round start -- while
the room held round 1 for the slowest seat, and then played the round start a second time (research 322 D1-D4). Now
`LobbyMatch` sends `loaded` on the frame its assets are in (the loader's minor state 2, D:L55699-55702) and holds the
screen on the host's barrier, a lane of `LoadingJoin` (`JoinLanes.barrier`): the room has no +0x112 on the wire and
tells its barrier as round 1's `roundStart`, sent the moment the barrier passes (`room.ts` `loaded` -> `startRound`),
so the barrier is a `roundStart` heard (or the hand-off's), or a welcome whose `phase` says a round is under way
(`play`, `expired`, `decided`, `over`) or that seats the page as a ghost -- the joiner, whom the original lets through
at once (its +0x112 is still 2) and whose lobby socket keeps only a `roundStart` (`gameLobbyHost.ts`); the hand-off's
welcome counts only on a late joiner's launch (`lateJoiner`), since the lobby's socket keeps its welcome across a
match's return and a later launch would hand on the last game's (the review's F2). A socket not open counts as passed, so a drop under the hold starts the match, whose own retry (or end) takes over. Then the 0.5 s, and
the match is mounted with the round's `spawn` and `roundStart` among the replayed events: no frame between the load and
the round. The room's ceiling still bounds the wait (past it the room starts round 1 and its `roundStart` releases the
page); a close for good still ends the load, and so does the game's end during the wait -- the room's `abandoned`
(a side emptied; its lobby reopened with no socket closed, `bridge.ts` `onAbandon`) ends the load on
`dlgNetAbandoned.rdr`, the load state's own exit on the game's end (D:L55735-55745), with no match mounted (the review's
F1). `/testroom` gives no barrier lane and keeps ONL-18b's release and report
(its room is a maps' room whose round 1 is the owner's countdown, above). Tests: `lobbyMatch.test.ts` "LOAD-HOLD" (the
slowest loader's hold, the release on the barrier, the round heard before the assets, the joiner, game 2 after the
adopt, the abandon during the wait, a drop under the hold), `loadingJoin.test.ts` "LOAD-HOLD".

**Round 1's start after the barrier, ROUND1-COUNT (2026-10-14; reading, pending review).** LOAD-HOLD left the room
starting round 1 the moment its barrier passed (§7 (a)), and the page releasing 0.5 s after the `roundStart`, so the
page's first frame was 0.5 s into the round. Re-read at the source: the host's load, its barrier passed, writes +0x112
2 and sends at once (`FUN_001f5e70` D:L55693-55696), sets its own completion byte +0xd0 on that byte (D:L55704-55707)
and counts its load state's 0.5 s -- the counter at the state's +0x10, zeroed when the map's load ends (D:L55603-55604,
D:L55658-55659), counted only while +0xd0 is set (D:L55748-55751) -- before it switches to the core state
(`FUN_002cf410`, D:L55753), whose init starts round 1 (`FUN_001ec480` D:L50946 -> `FUN_002a7d40`, game state 3 under
the host D:L149762). A client counts the same 0.5 s from the later of its own load's end and the host's byte. So round 1
starts on the host 0.5 s after its barrier, and each console cuts from its loading screen to round 1 at max(its load,
the barrier received) + 0.5 s -- about when the host starts it. The port, with no +0x112 on the wire (a new event would
be a protocol change, not made): the room holds its round 1 `ROUND1_AFTER_BARRIER_S_READING` (0.5 s, 30 of its ticks)
after the barrier passes -- the last `loaded`, or the ceiling -- the hold (and the welcome's `loading`) standing meanwhile,
a `loaded` heard in it counting for nothing (`room.ts` `barrierPassed`, `clock`); and the page's `LoadingJoin` counts its
own 0.5 s from the frame its other lanes are all in (its assets), releasing on the later of that count's end and the
barrier (`roundStart`) -- max(assets + 0.5, round 1) = max(assets, barrier) + 0.5 when round 1 is the barrier + 0.5 s.
A page loaded in time therefore mounts on the frame after the `roundStart`, its clock whole (`LobbyMatch.lateBy` one
frame). The later rounds are unchanged (the round screens' timing), as are the joiner let through by its welcome and
the drop (both release 0.5 s after the assets). A page built before this on a server with it would release 1 s after
the barrier: the page and the server ship together (research 221 §10). Note that A_ready021's first frame (05:59, §2)
does not tell 0 s from 0.5 s into the round -- the clock is floored to whole seconds -- so the capture of ONL-32 that
settles this reads the timing of the cut, not that frame's digits. Tests: `roomLoadBarrier.test.ts` "ROUND1-COUNT" (the
reading's value, the last `loaded`, the ceiling, a `loaded` in the count, a side emptied in it, round 2's start
unchanged) and the ONL-18b cases moved by the 0.5 s; `roomLaunch.test.ts` (the idle case's steps); `loadingJoin.test.ts`
and `lobbyMatch.test.ts` (LOAD-HOLD's release now on round 1, and round 1 within 0.5 s of the assets).

**The report point after the match is prepared, IP3 (2026-11-02, card bbXnSJNH; reading, pending review).** LOAD-HOLD
put the page's `loaded` (and the start of its own 0.5 s) at its assets -- the worker's decode answered -- and mounted the
match only after `roundStart`, so the world's build, the renderer, the scene's compile and the first frame all ran after
round 1 had started (was: "`LobbyMatch` sends `loaded` on the frame its assets are in (the loader's minor state 2,
D:L55699-55702)", above). Re-read at the source: the load state marks its load done -- the state's +0xd set and its
counter zeroed -- only once its level-load thread has ended (`FUN_001f5e70` D:L55657-55660 online, D:L55601-55604
offline; the thread, `FUN_001ebda0`, clears `DAT_00408684` as it exits, D:L50735), and only with +0xd set does it report
minor state 2 (`FUN_002a73b0(.., 2)` and `FUN_002c5360`, D:L55699-55702), then wait on the host's barrier (D:L55704-55707)
and count its 0.5 s (D:L55748-55755). The level is resident and ready to draw when the console says it is loaded. The
page's equivalent is its match prepared (`LOAD_REPORT_AT_PREPARED_READING`, `lobbyMatch.ts`): `MatchLoader.prepare`
(`matchMount.ts`) runs the mount's own stage 1 (`prepareMount`, since 5d's design of 2026-11-02: the prepare IS the
mount, stopped before `join()`) on a hidden canvas -- the match's construction, `place` (the world, the own body and its
kit, the throwables, the effects), the renderer, the picture and the three warms (`warmThrows`, `warmEffects`,
`warmShadow`) -- and draws its frames until the mount's own first-frame gate holds (`firstFrame`'s: the warm settled,
two frames rendered); `LobbyMatch` counts its load done only once the assets AND the prepare have settled (a failed
prepare ends it too: never a stuck screen), so `loaded` and the page's 0.5 s follow the prepared first frame. The mount
of the same mission attaches the hand-off to that match (`PreparedMount.attach`: the canvas shown, the input bound,
`join()`) -- no second renderer, `place` or warm. Without a prepare (the test rooms, other callers) the load ends at the
assets, as before. Where the reading does not hold (the page's report point is then not the prepared first frame):
under the HD picture there is no prepare (the HD pack's textures are collected before the mount builds its world), so
`loaded` goes at the assets, as before IP3; and past the prepare's bound (`PREPARE_WAIT_BOUND_ADAPTATION`, from the
assets' arrival) `loaded` goes before the prepared first frame, the prepared match kept for the mount. That the
browser's compile and first frame belong inside the console's level load is the reading -- the PS2 compiles no shader,
so the source places the moment, not the work. The port's own cost, for scale (a timed run of the port, not of the original: f9's harness,
headless Chromium on a c7a.4xlarge, head 5fc7c58dd, the `s2u:load:*` marks; the run's record, outside the repository:
`agent-mail/evidence/cb-loading/ip3-marks/`, the f9 run of 2026-11-02 at 5fc7c58dd): decode-done 2.6-2.8 s, world-built
3.2-3.35 s, renderer 3.3-3.55 s, warm-settled 17.4-18.1 s and first-frame 17.5-18.1 s after load-start, the room's
barrier passed about 5.5 s after the hold -- before the warm, which is the cost this moves ahead of the report. Settles:
a capture of a slow PS2 client's load against the host's round 1 (ONL-32) -- its minor state 2 sent when its level is
drawn-ready, the host's barrier on it. Tests: `lobbyMatch.test.ts` "IP3", `matchPrepare.test.ts`.
*Corrected 2026-11-02:* the IP3 brief named `DAT_00408685` as the flag the load thread clears; the flag is
`DAT_00408684`. `FUN_001ebba0` sets both (D:L50642-50643); the load thread, `FUN_001ebda0`, clears only `DAT_00408684` as
it exits (D:L50735); `DAT_00408685` marks the load begun: within the online branch (selected by `DAT_0045a0c1`,
D:L55600) it picks between starting the load (D:L55616-55655) and waiting on `DAT_00408684` (D:L55657-55660), and it
is also read at D:L55599. The review re-read this at the source on 2026-11-02 (*corrected again* the same day, the
review's N2: the fold had `DAT_00408685` picking the online branch, which is `DAT_0045a0c1`'s).

**The `/testroom` path differs, and the same rule covers it.** There the room is a maps' room: the owner's 10 s
countdown (`OWNER_LAUNCH_COUNTDOWN_S`, OC-5) starts when both sides are seated, and a seat is taken at the welcome --
while PR #10's hold still covers the page. The controller's browser run of `grenadeSelfMp.spec` (2026-10-05, relayed;
not run here) saw it: a late joiner started the countdown under its own loading hold, the round started and closed
that player's ARMORY (`ARMORY_WAITING_LAUNCH_READING`) before the hold let go; the player stayed seated. In the
original no player is in an ARMORY when a round starts: the ARMORY is a row of the game lobby before the load
(research 125 §8, A_ready007), and a loader whose assets are not in holds every page at the host's barrier, so nothing
counts down on it (above). So the rule for both paths is the barrier: a seat still loading neither starts a countdown
nor is started without -- the room's round (and the test room's countdown) counts only from the last seated player's
`loaded`. Until it rides protocol 10, the lobby's path joins late with no ARMORY to lose (its match opens none: ONL-17
pulls the ARMORY out in the lobby), and the test room's keeps the behaviour seen (its countdown and ARMORY are `./main`'s,
not this task's). *ONL-18b (2026-10-06, research 221 §7) built the barrier for the launched game only: the test room
is a dedicated room whose round 1 is the owner's countdown, and holding it would not keep the slow seat's ARMORY
either -- the hold ends on that seat's own `loaded`, the moment its screen lifts, and the round's start then closes a
seat's ARMORY (`ARMORY_SEAT_READING`) before DONE can be pressed; `grenadeSelfMp.spec`'s DONE stays conditional.*

## 4. The way back (R166.4)

During the load, a close the server made for good (`GAME_FINAL_CLOSES`) or a refused hello ends it as the load state
does (`FUN_001f5e70` D:L55710-55745: the dialog written into the menu state's start dialog 0x408568, then the menu
state): 4007, the game ended -> `dlgNetAbandoned.rdr` (0x3e2f70, #528); any other -> `dlgNetError.rdr` (0x3e2f60,
`MATCH_NET_ERROR_DIALOG_READING`). A drop (1006, 4010) is no end: the match starts and `NetPage` retries the seat. In
the match, `NetPage`'s own `ended(dialog)` does the same (#528 -> `dlgNetAbandoned.rdr`, #539 the vote kick ->
`dlgNetBanned.rdr`, #365 -> `dlgNetError.rdr`); the session's `back` sets `machine.menu.startDialog` and switches to the
menu state. A match that cannot retry its own drops (no `ended`: the session's default when the page gives no match,
or a match module that would not load, §8) ends at any close of the client, a drop with `dlgNetError.rdr`, so no path
leaves the page in a match holding the session on a socket nobody reopens (the review of 2026-10-05, finding 1); only
a real `NetPage` retries. The match's end -- GAME COMPLETE, then `call_gamelobby`'s `WAIT 10` and `return_to_gamelobby`
(`CloseAndSwitch dlgGameLobby.rdr`, `mp_x_sec_clock` 11; research 179 §6.18) -- returns to the same game's lobby still
connected: `LobbyMatch.matchOver` takes the client from the match open and `GameSocketHost.adopt` listens to it again,
the hold kept (`MATCH_END_RETURN_READING`). PF-26's round screens (sprint 26) call it; until then it is the tested
stub. **The session's end** (the game lobby review's finding 2): `FrontEndSession.close`, the lobby's `disconnect` and
its lost session (the ticket gone, seen at the next frame) close the game socket -- or, after the hand-off, the match's
client -- with `socketHolds(false)` (`sessionGone`), and the page comes back to the front end with no dialog of its own
(`stopped`: the canvas shown, the menu state on the dialog it left, for the lobby's CONNECT FAILURE to draw on; the
review's finding 2). A new game's socket forgets the last game's `roundStart` (`GameSocketHost.connect`; finding 3).
**The return, since sprint 17's close** (d6bf6658 and the second fix round): `back` writes the dialog and leaves and
enters the menu state again, so the dialog is built on screen; `GameLobbyCommands.matchReturned` undoes the launch
(`started` false, the lobby's state again) and `GameSocketHost.adopt` forgets the last match's `roundStart`. A view still
carrying `launched` starts no second hand-off until the room has shown the game not launched again
(`GameLobbyCommands`' `relaunchable`). **Owed to PF-26 (the server's side of the return)**: the room's `PreMatch.launched`
is reset only by `reopen` (an abandon), and at a match's end the room starts the next match itself
(`room.ts` `startRound(st.matchOver)`), so the exact sequence today is: the match ends -> the page's `matchOver` (no
caller yet: PF-26's screens) -> `back` into `dlgGameLobby.rdr`, the client adopted -> the room's `gameLobby` views keep
`launched: true` -> the page starts no hand-off (correct: no READY was pressed) while the room runs the next match
without the page in it. The original returns every console to the game lobby and launches again only after READY
(`return_to_gamelobby`, research 179 §6.18): the room must reopen its pre-match state at a match's end (`launched`
false, every seat not ready) for a second match in the same lobby to start; that is PF-26's, with its screens.

## 5. On the page

`mountFrontEnd` gives the session the ports: PR #10's `LoadingPanel` (`pageLobbyMatchScreen`'s screen), the front
end's canvas hidden while the match has the page and shown again on the way back. Since ONL-18c the load and the match
are `./matchMount`'s, loaded only at the first match's load (§8).

## 6. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `MATCH_END_RETURN_READING` (`packages/viewer/src/lobbyMatch.ts`) | `dlgGameLobby.rdr`, the client kept | GAME COMPLETE's `call_gamelobby` / `return_to_gamelobby` (research 179 §6.18) take every page back into the same game's lobby | PF-26's screens calling `matchOver`; a capture of a match's end |
| `MATCH_NET_ERROR_DIALOG_READING` (`lobbyMatch.ts`) | `dlgNetError.rdr` | the load state's net failure exit (`FUN_001f5e70` D:L55710-55721); the round screens' `TimeoutMonitor` | a capture of a disconnect during a load |
| `ROUND_EPOCH_PLACEHOLDER` (`lobbyMatch.ts`) | the `roundStart`'s arrival; each `score`'s `timeLeft` | the page keeps no map from the room's ticks to its own clock (`FUN_002aa490` counts from the start); since ONL-18b's barrier the arrival is the start within one trip for every page loaded in time | `roundStart.startTick` read against `welcome.tick` / `pong.tick` (research 221 §5) |
| `CLIENT_ROUND_WAIT_READING` (`lobbyMatch.ts`, LOAD-HOLD; ROUND1-COUNT; IP3) | `loaded` at the prepared first frame (was, until IP3: "at the assets"); the screen held until the room's `roundStart` (sent 0.5 s after its barrier), or a welcome with a round under way or a ghost seat, and 0.5 s from the assets (was, LOAD-HOLD: "then 0.5 s" from the barrier) | a client's load completes on the host's barrier, +0x112 = 2 sent as it passes (`FUN_001f5e70` D:L55693-55707, `FUN_002c00f0` D:L163083-163084, `FUN_002c0850` D:L163415-163416), about 0.5 s before game state 3 (D:L149762); not settled that a client takes this path and not its +0xcd one (D:L55684-55685, research 125's `LOAD_NET_HOLD_READING`) -- research 322 (agent/parity-2 0d2d69644) §1.1, §5 | a two-console capture with one slow loader: the fast console's screen held until the slow one is in, its cut at its first round frame, 0.5 s after the barrier (ROUND1-COUNT; was, LOAD-HOLD: "its cut about 0.5 s before its first round frame's clock", research 322 §5) |
| `LOAD_REPORT_AT_PREPARED_READING` (`packages/viewer/src/lobbyMatch.ts`, IP3, 2026-11-02; reading, pending review) | `loaded` (and the page's own 0.5 s) once the assets are in and the match is prepared (`MatchLoader.prepare`: the mount's own stage 1 -- canvas, renderer, world and own body placed, compiled, drawn to the mount's first-frame gate); a failed prepare ends the load too; without a prepare, at the assets; not held under the HD picture (no prepare: at the assets) nor past `PREPARE_WAIT_BOUND_ADAPTATION` (before the prepared first frame) | the load state marks its load done once its level-load thread has ended (`FUN_001f5e70` D:L55657-55660; `FUN_001ebda0` D:L50735) and only then reports minor state 2 (D:L55699-55702), before the barrier (D:L55704-55707) and its 0.5 s (D:L55748-55755); that the browser's compile and first frame sit inside that level load is the reading (§3, IP3) | a capture of a slow PS2 client's load against the host's round 1 (ONL-32): its minor state 2 sent when its level is drawn-ready, the host's barrier on it |
| `ROUND1_AFTER_BARRIER_S_READING` (`packages/match/src/room.ts`, ROUND1-COUNT) | 0.5 s (30 ticks): round 1 of a launch starts this long after the load barrier passes (the last `loaded`, or the ceiling) | the host's load state counts 0.5 s after its barrier (`FUN_001f5e70` D:L55693-55696, D:L55704-55707, D:L55748-55755; the counter zeroed at the load's end D:L55657-55659 online, D:L55603-55604 offline) before the core state's init starts round 1 (`FUN_001ec480` D:L50946, `FUN_002a7d40` D:L149762) (§3) | a capture of a launch (ONL-32): the host's last loader in, round 1's first frame 0.5 s after the barrier, every console's cut at it |
| `SLOW_LOADER_PLACEHOLDER` (was `lobbyMatch.ts`) | joined the running round late | the original holds all at the host's barrier (§3) | retired 2026-10-06 (ONL-18b, research 221): the room holds round 1 for every seat's `loaded` |
| `LOBBY_MATCH_VIEWER_PLACEHOLDER` (was `packages/viewer/src/frontEnd.ts`) | the client kept, no world drawn | the map viewer (`./main`) was not mountable in the front end's page | resolved (ONL-18c, 2026-10-05: `./matchMount`, §8) |
| `MATCH_MOUNT_PARTS_PLACEHOLDER` (`packages/viewer/src/matchMount.ts`) | the world, the walk on the pad, the bodies, the HUD, the match, and since ONL-18d the firearm with its reticle and effects mounted -- since ONE-WIRE (2026-10-06, research 222) one wiring with `/testroom`'s, not a copy; since MATCH-SOUND (2026-10-06, research 222 §7) the sound with the round's cues; since MATCH-THROW (2026-10-06, research 222 §8) the throwables, the launcher and the R2 inventory; the parts `FRONT_END_CAPABILITIES` has off not yet: the world drops, WEAPON EXCHANGE, the ARMORY, the doors, sprint 27's actions, the traversal, the touch layer, the tactical map, the shadow | the original's match has every one; each not mounted is still `./main`'s wiring, but for the action part (`./matchActions`, research 222 §5) | each part mounted by its switch turned on and its part handed; a two-page browser run (below in §8; no note 168 was written); the hostages' orders and marks (HX-4a/HX-5, web sprint 31: `/testroom`'s only, HX.R8); |

Adaptations, named and not ledger suffixes: `LOBBY_MATCH_EVENTS_ADAPTATION`, `LOBBY_MATCH_ASSETS_ADAPTATION`
(`lobbyMatch.ts`). Reused: research 221's `LOAD_BARRIER_TIMEOUT_PLACEHOLDER` (the server's ceiling, which bounds
LOAD-HOLD's wait), research 125's `LOAD_NET_HOLD_CEILING_PLACEHOLDER` (through `LoadingJoin`), research 159's
`GAME_ENDED_DIALOG_READING`, `GAME_KICKED_DIALOG_READING`, research 165's `LOBBY_IDLE_WALK_ADAPTATION`.

## 7. Unknowns, what is not done

- **No capture compared**: `A_ready009..021` and the recomp equivalent (ONL-32); no browser run.
- **The match's world in the page** is mounted since ONL-18c (§8), without the parts `MATCH_MOUNT_PARTS_PLACEHOLDER`
  lists; **the load's real work** is the map's decode and the clips (the meshes' upload and the programs' warm-up are
  the match's first frame, not the screen's).
- **TRIANGLE on the loading screen** (`exit_load_screen` -> `AbortLoad dlgNetAbort.rdr`, research 125 §3) is not bound.
- **The load barrier** (§3) and the round's epoch (§2) need protocol fields, relayed to sprint 26 (protocol 10).
- The late joiner's path (`LATE_JOINER_NEXT_ROUND_READING`, research 165 §2) goes through the same hand-off at the
  room's next round; it is not tested here beyond the lobby's own tests. *2026-10-14 (WATCH-DOCS; stale since W19.R12,
  as LATE-WATCH's review noted): a late seat no longer waits in the lobby for the room's next round -- its READY hands it
  off with the lobby's welcome and no `roundStart` (`ReadyToLoad`'s late branch, `READY_LOADS_LATE_JOINER_READING`,
  research 314 §4.2; `LATE_JOINER_NEXT_ROUND_READING` reworded, research 165 §6): a watcher is live at once, the ghost
  held (`LobbyMatch.blocked`) until the room's next `roundStart` ((b) below). Held by ui `gameLobbyScreen.test.ts`
  (dev-disc) and viewer `lobbyMatch.test.ts`, `frontEndMatch.test.ts`, `gameLobbyHost.test.ts` (unit).*
- **Left by LOAD-HOLD (2026-10-14), recorded, not changed:** (a) the room starts round 1 the moment its barrier passes,
  where the original's host counts its own 0.5 s first (D:L55748-55755) and starts the round in its core state's init
  (`FUN_001ec480` D:L50946); so a page released 0.5 s after the room's `roundStart` enters a round 0.5 s old (its clock
  05:59 on the first frame, as A_ready021's first frame reads, §2) -- the room's timing, the server's to
  weigh. *Built by ROUND1-COUNT (2026-10-14, §3): round 1 the host's 0.5 s after the barrier, the page's count from its
  assets; reading, pending review.* (b) A joiner let through by its welcome (no `roundStart`) is mounted with `LobbyMatch.blocked` still true until
  the room's next `roundStart`, as before LOAD-HOLD (ONL-18's hold; a ghost has no body until then). *2026-10-14,
  LATE-WATCH (W19.R12; research 314 §4.2): a late watcher let through by a welcome with a round under way is live at once
  (`LobbyMatch.blocked` false from the match's first frame); the ghost stays held as above.* (c) The mount's
  replay of the lobby's welcome still posts its round banner (`netPage.ts` L1314) before the replayed `roundStart`
  posts it again; both run in the same task before any frame, and `Hud.startRound` resets what it sets, so one round
  start is drawn (`netPage.ts` and `hud.ts` are not this task's). (d) The original's TRIANGLE on the loading screen
  (above) is still not bound.

## 8. The match's world in the front end's page (ONL-18c)

Written 2026-10-05 for ONL-18c (`agent/s17-match`, pending review). The gap §5 left: after the loading screen the
match held the open client and drew nothing, because the map viewer and the round are `./main`'s, a module whose top
level reads `/testroom`'s markup as it loads (`#view` at its line 143, `#mode` 181, `#loading` 1057, `#mp-name` 1166,
`#tw-weapons` 1626, `#player-body` 1695, `document.body` 1583 and 1810, `Ui`'s and `PlayUi`'s panel) and wires
everything -- the world, the walk, the gunplay, the ARMORY, WEAPON EXCHANGE, the pad and touch, the net -- as
module-level singletons with page-lifetime listeners. It can neither be imported by the front end's page (OT.R12) nor
mounted twice or let go.

**The seam as built.** `packages/viewer/src/matchMount.ts`:

- `mountMatch(target, { client, events, handOff, holds, assets, renderer?, win? })` builds the match into the element
  it is given (its own canvas appended, or the canvas itself) and reads nothing else of the document: the scene, the
  fly camera and the walk (`./camera`, `./walk`), the world from the decoded map (`./world` `buildWorld`, revealed in
  one go behind the loading screen's release), the map's fog, clip planes, scale and field of view, the stand at the
  measured spawn, the own body by side (`./teamBody`) with the kit's firearms hung, the others (`./remotePlayers`, the
  map's kits), the HUD (`./hud`: the clock, the messages, the round's banners and end screens, the scoreboard held on
  SELECT -- or Tab in a development build -- the compass and the stance), the pad's game lanes (`./setupPad`,
  `./gamepad`: the move and look sticks, the jump, the crouch and the stance button; the hold's flush,
  `./padFlush`), and a `NetPage` on the **same** client (`game.adopt`: no second socket, hello or ticket; the hold,
  the pinned URL and `socketHolds` exactly as ONL-18 and HARD-SEAT left them). `ended` is `NetPageDeps.game.ended`'s
  dialog; the events the client brings between the mount and the `NetPage` (the world's build) are kept and replayed
  after the lobby's, the side read off the client while the `NetPage` replays them (a Terrorist seat's spawn is a
  Terrorist's kit and body: the review's F1). While `LobbyMatch.blocked` holds (no round yet) the camera takes no
  input and the pad is flushed each frame, as `./main`'s `padFrame` does under its own hold (F2). `release` hands the client back open -- `NetPage.release`: no retry, nothing of the match on the
  HUD, no listener of the page on it, the hold passing with it -- and lets everything else go (the frames, every
  window listener, the camera's new `dispose`, the world's, the HUD's (`Hud.dispose`) and the renderer's resources,
  WebGL2's context lost at once (`WEBGL_lose_context`, F3), the canvas); `close` closes it.
- `matchLoader(source)` decodes the mission's map (`missionMapPath`) and the play clips in the map viewer's worker
  (`./worker`, off the visitor's disc image or the served tree, as `/testroom` reads them) while the loading screen
  shows -- `LobbyMatch`'s `load` port -- and mounts the match on that load.
- `lobbyMatch.ts`: `deferredMatch(client, made)` -- the match as a handle at once while its module comes (a close for
  good ends it meanwhile; `release` answers the client; a module that never comes ends the match at any close, as the
  handle with no `ended` did); the `start` port is given the session's `holds`; `finalCloseDialog` shared.
- `frontEnd.ts`: `mountFrontEnd`'s `load` and `start` ports load `./matchMount` with `import()` at the first match's
  load, so the front end's bundle carries neither it nor `./main` (OT.R12; `test/entry.test.ts`'s guards and
  `test/matchMount.test.ts`'s scan); while the match has the page the menus read no pad (the original's menus are not
  running in a match) and their canvas is hidden; the loader's worker ends with the page.

**What moved out of `./main` at ONL-18c: nothing** (since ONE-WIRE, 2026-10-06, the shared parts below and research
222). The brief's seam had `./main` reduced to wiring `/testroom`'s markup into the same function; done piece by piece it means re-wiring most of its 2,603 lines (every part reads the others'
module-level state), which sprint 25's edits to the same file (the audio unlock before the keydown listeners) would
collide with. `mountMatch` composes the same modules `./main` composes, transcribing its wiring for the parts it
mounts (`show`'s world, fog and stand; `connectNet`'s `NetPageDeps`; `padFrame`'s game lanes; `hangKit`, `sideLoadout`,
the others' kits), each commented with the `./main` function it follows; `./main` is unchanged. Moving each part into
one both pages mount -- and so ending the transcription -- is owed with the parts `MATCH_MOUNT_PARTS_PLACEHOLDER`
lists (§6).

**ONE-WIRE (2026-10-06, research 222): the transcription ended.** Both pages mount the same parts: `./matchCore` (the
capabilities switch -- `/testroom` every part, the front end the firearm alone --, the side with the client's team
fallback, the kit on the map, the fog, the stand, the camera's lanes), `./matchFirearm` (the one firearm; `/testroom`'s
throwables, launcher, turret and R2 inventory plug into it as `FirearmHands`, its sound as `FirearmSound`),
`./matchNet` (the `NetPage` deps, each part's own listed once in `PART_DEPS` and refused from a page whose switch has
it off), `./matchLanes` (the pad's game lanes in `FUN_00594cf0`'s order); sprint 27's action part is `./matchActions`,
mounted by `/testroom` alone. `main.ts` went from 3,005 lines to 2,398. The copies' drift is gone (the fire's pitch
push, the tracer rule, the zoom's view tick and the spawned kit's `weapons()` reach the front end); the differences
the pages keep are research 222 §4's, each a front-end-only need or a part not mounted. The frame stays each page's,
calling the parts' named steps in `main.ts`'s order.

**What the front end's match lacks** (`MATCH_MOUNT_PARTS_PLACEHOLDER`, §6; as of ONL-18c): the firearm and its
reticle (mounted since ONL-18d, below), the throwables and launchers, WEAPON EXCHANGE, the ARMORY (the game socket's
hello asks for none, so no seat waits on it), the doors, the traversal, the effects and the sound with the round's
streamed cues, the touch layer, the character shadow and the tactical map. Two players in one round can see each other
in the snapshot, walk, die and respawn as the room says, and read the round's clock, banners and scoreboard.

**MATCH-SOUND (2026-10-06, research 222 §7): the sound mounted.** The front end's switch has the sound on: the match
mounts `/testroom`'s sound (`./matchSound`: the walk's and the others' footfalls, the firearm's rounds and reloads, the
effects' sound door, the voices, the ringing ears, the round's streamed cues and objective lines) on a `GameAudio` of
its own over the menus' `AudioContext` -- running since the disc page's click, no second gesture -- with its own
master, reverb and music slot, so the menus' HUDUI and slot survive it; `matchLoader` asks the map's sound with its
effects. The menus' music stops at the match's loading screen and plays again at the return
(`MATCH_RETURN_MUSIC_PLACEHOLDER`). The effects' sound door below is no longer silent.

**MATCH-THROW (2026-10-06, research 222 §8): the throwables, the launcher and the R2 inventory mounted.** The front
end's switch has them on: the match mounts `/testroom`'s part (`./matchThrow`, moved out of `main.ts`) -- R2 opens
`CWeaponSel` and takes a throwable, a charge or a launcher up as on `/testroom`; R1 throws, cooks, places and fires
them, each only through `NetPage.throwEvent` (the room validates each); a launcher round is flown on the page; a stale
throw gives its item back; the others' grenades and charges are flown and drawn; the flashbang washes and glows; the
sounds are the match's audio's, the effects the firearm's; all of it freed at the match's release and close. Not on the
front end: the world drops (their pickup is the action part's), the claymore's refusal line, C4's targets (no scene
programs' world) -- research 222 §8; the round-start clear of the air, the decals and the flash's wash is the parts' own
there since the review round (research 222 §8), and the throw's arc and scorches are warmed with the map.

**MATCH-GAPS (2026-10-06, research 222 §9): the claymore's message line and C4's world.** The two throwable gaps
MATCH-THROW left are closed on the front end: the claymore's refusal (`Unable To Deploy: Max Equipment Items Placed
(4)`, 0x65f880) is posted on the HUD's message window in colour 2, as the original posts it (`FUN_005be9a0` D:L475331;
`./matchMessages`), and the match builds the page's world from the map (`./matchWorld`, `/testroom`'s `pageWorld`) --
the walk's hull grid, the opening state, the scene programs stepped each frame, the room's world followed through
protocol 10 -- so C4 settles on and plants against the map's destructibles as on `/testroom`. The Action button that
plants it is the action part's (`./matchActions`), still not mounted here; `/testroom` keeps its toast and its own world
lines until sprint 31's wave 4 lets `main.ts` adopt the two helpers (owed; the refusal adopted 2026-10-11, PARITY-2
PAR-36 (c); `buildPageWorld` still owed).

**Tests**: `test/matchMount.test.ts` (14: `NetPage.release`; the Terrorist seat's replayed spawn; the hold's input
suspension and flush; the mount with no `/testroom` markup and no
`getElementById` or `querySelector`, a synthetic map built into the drawn scene and let go, release and close, a
close before the assets, the events between the mount and the match, `ended`; `LobbyMatch`'s begin mounting it and
the match's end releasing it to `GameSocketHost.adopt`; a module released before it lands; the bundle scan). **Not
run**: a browser (§7) -- the two-page walk is recorded below in this section (the waves table's `two-players`; no note 168 was written).

**ONL-18d: the firearm** (2026-10-05, `agent/s17-match`, pending review). `packages/viewer/src/matchFirearm.ts`
`mountFirearm` copies `./main`'s gunplay into the front end's match, each piece commented with the `./main` function
or block it follows: the fire (`Fire` and its source), the bloom and the view states (`Accuracy`, `Zoom`, `fire.setGun`),
the kit and its swap (`Kit`, `fireModes`), the launcher rounds' slots and the fire modes (`KitRounds`, `showFireMode`,
`switchFireMode`, `zoomHold`, `setZoom`, `stepZoom`), `spawnKit`'s resets (its `respawned` replaces ONL-18c's
minimal one), `hangKit` and `weaponFrame`, `trigger`, `padFrame`'s lanes (R1 off the merged lanes' change; the zoom,
fire-mode, reload, swap and inventory edges; `fire.release()` under the hold), `kitInventory` (R2: the rifle, the
Mark 23, round -- the pouch is empty while no throwable is mounted), `playLanes`' scope lines, `gunFrame` (the bloom's
ticks, the FOV, the look's divisor, the HUD zoom, the night vision and the scope lenses, their sound out), the
reticle's pass, the HUD's weapon box (`hud.feed`), `show`'s firearm lines (the marks, the shade and clip, the FOV, the
night), the worker's `effects` answer (the runs, the lenses' rows, the marks, the penetration; `matchLoader` asks for
it after the map), and `connectNet`'s `died`, `roundEffects`, `roundImpact` and `menuOpen`. **Every round, reload and
launch reaches the room only through `NetPage`** (`fireEvent`, `throwEvent`), as `/testroom`'s `fire.subscribe` sends
them; the room validates each. Not copied: the throwables and launchers (a launcher round leaves to the room but is
not flown on the page), the sound (the effects' sound door is silent), WEAPON EXCHANGE, the ARMORY. `Fire.dispose` is
new (its marks, tracer, materials and bitmap freed); the match lets the firearm, its effects and the reticle go at its
end, the page-wide lens let go. `./main` is unchanged.

**Tests (ONL-18d)**: `test/matchMount.test.ts` +5 (19 in all): R1 sends rounds only as `NetPage.fireEvent`s; no round
while held, nor for an R1 held through the hold's release, a fresh press firing; a respawn's kit for the seat's side
(the loadout spawned, the fire, bloom and view reset to its primary); the R3, L2, L1 and d-pad Up lanes; the firearm
freed at the teardown. The review's round (2026-10-05): R (the development build's reload key) is held off while
`LobbyMatch.blocked` stands, as `./main` swallows every key under its hold (main.ts:829); the dead's held trigger is let
go before the net's frame (main.ts:1932); the view lanes run after the zoom's step, as `./main`'s `playLanes`.

**The two-page walk (the waves table's `two-players`), run green in a browser** (2026-10-05, three runs, about 3 minutes each, one worker,
the page on 5370, the spec's own match server on 5371, the served tree extracted with `--with-streams` as a copy and
deleted after). `e2e/twoPagesMatch.spec.ts` walks the original dialogs by their own scripts from the page's keys and
the soft keyboard's physical typing, waiting between presses on the shell's `currentName`, the focus ring's focused
control, the popup and the shell's switch and input hold (a press the scripts still hold off is pressed again):
LOGIN (`login_btn`), DNAS, SELECT UNIVERSE (`SERVERLIST`), the persona form (the persona list's new name, the
password, CONNECT; #606, the card slot aborted, the save declined), CONNECT's "register this Player Name?" YES, USER
AGREEMENT, the online menu's message of the day, BRIEFING ROOMS, the room; on page A CREATE GAME (the game's name,
FROSTFIRE the play list's one map, SQUARE), the session master's #350; on page B JOIN GAME and the room's game; B's
SWITCH TEAMS (the room launches only with both sides seated) and both READY, each pressed once its seat's gate in the
room's `gameLobby` view has run out (`readyIn`, 11 s: the joiner's buttons come up at once, `ComeFromBriefing`, and the
room refuses an early press as `gate`); the room's launch, the loading screen, and both pages in round 1 -- a SEAL and a
Terrorist, each seeing the other in its snapshot. A's rounds reach the room through `NetPage` and the room tells B
(15-18 `shot` events). **Not seen: a hit** -- A faces B through the spec's hook (`MATCH_WINDOW_HOOK`, a development
build's playtest instrument) and fires, but the two spawns on FROSTFIRE have no clear line between them and the rounds
land in the containers; the hurt or impact event is owed to a walk that brings the two into sight. Found on the way,
recorded, not changed here: the joiner's READY and SWITCH TEAMS come up before the room's 11 s gate, so the first press
is refused (`gate`); the original's `ComeFromBriefing` path and the room's gate disagree (an ONL-16a / SVC-07a matter).

