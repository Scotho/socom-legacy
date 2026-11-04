# 221 -- The load barrier: round 1 held for every seat's `loaded`, and the welcome's phase (ONL-18b)

Written 2026-10-06 for ONL-18b, the online lane's first task after web sprint 17's close, on protocol 10's contract
(MAP-03; the online plan's Log of 2026-10-05; [research 166](166-the-loading-screen-from-the-lobby-to-the-match.md)
§3) and the hand-over of sprint 26's PF-33 ([research 179](179-c1-match-server.md) §6.22, `LOAD_NET_HOLD`). It adds
the owed additive `welcome.phase` of XR-06 ([research 214](214-demolition-as-built.md) §6). The code:
`packages/match/src/room.ts` (the launch section: `firstRound`, `loaded`, the clock's hold; the welcome's one field),
`packages/central/src/bridge.ts` (the game room's options), `packages/viewer/src/loadingJoin.ts`, `net/client.ts`,
`lobbyMatch.ts`, `main.ts` (the release), `bombPage.ts`, `net/protocol.ts`. The tests: `packages/match/test/
roomLoadBarrier.test.ts` (new), `bridge.test.ts`; `packages/viewer/test/loadingJoin.test.ts`, `netClient.test.ts`,
`lobbyMatch.test.ts`, `bombPage.test.ts`. No game or emulator was run; no server but the tests' own was contacted.

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R221.1 | **The original's host waits for every launched non-spectator to report loaded**: `FUN_002c4020` walks the 24 slots and fails while any slot with a record, not a spectator (flag 0x10000), has major state 2 and minor state not 2; the host's load sets `+0x112` to 2 and reports only when it passes, and a client's load completes on that or on game state 3 [reading, re-read at the source for this note] | a launched game's round 1 is held in the room until every seat seated at the launch has sent `loaded`; spectators are not waited for | §1, §3 |
| R221.2 | **The original's load has no timer** (research 179 §6.23) | the room's ceiling is a server adaptation, `LOAD_BARRIER_TIMEOUT_PLACEHOLDER` (90 s): past it round 1 starts and a seat still loading joins late as before | §4 |
| R221.3 | **The page reports once a load, at the release**: `LoadingJoin.begin(id, report)` runs the report on the releasing frame only; both the front end's match (`LobbyMatch`) and `/testroom` (`main.ts`) pass `NetClient.reportLoaded`, which is owed until the socket's welcome | `SLOW_LOADER_PLACEHOLDER` retired; `ROUND_EPOCH_PLACEHOLDER` re-filed, still named | §5 |
| R221.4 | **The welcome carries the room's state** (`phase`, additive under protocol 10, no version change): `waiting`, `loading` (the hold), `play`, `expired`, `decided`, `over` | `bombPage.ts` takes a joiner as in play only in `play`: a joiner in an elimination's decided hold is not; `JOIN_DECIDED_PHASE_READING` retired | §6 |
| R221.5 | **The barrier does not keep a slow second seat's ARMORY** | `grenadeSelfMp.spec`'s DONE stays conditional | §7 |

## 1. The original's barrier

`FUN_002c4020` (D:L165416-165441) walks slot indices 0 to 0x17 of the table at `DAT_004414c0`, two words a slot, and
returns 0 at the first slot whose record is present, not a spectator's (bit 0x10000 of its first word clear), with
major state `+0x40` 2 and minor state `+0x41` not 2 (D:L165432-165433); else 1. A slot without a record is skipped.
The load state's network branch (`FUN_001f5e70`) calls it on the host while `+0x112` is 1, and on its pass sets
`+0x112` to 2 and reports (`FUN_002a7510`, `FUN_002c00f0`; D:L55693-55697); every loader whose minor state is not yet
2 sets it and reports its slot (`FUN_002a73b0(.., 2)`, `FUN_002c5360`; D:L55699-55702); a client's completion byte
`+0xd0` is set on `+0x112` 2, or on game state 3 when it is no host (D:L55704-55707). Research 179 §6.22 read the
same; research 166 §3 relayed it.

What the room takes from it: the players seated at the launch are the slots with major state 2; a spectator is not
waited for; a seat that joins after the launch is not one the hold waits for (its major state is not the launch's).
A seat that leaves during the hold is no longer counted: the original skips a slot with no record, and a leave empties
the slot (the leave callback `FUN_002c5750` D:L166316-166327, confirmed by ONL-18b's reviewer).

## 2. The wire

Protocol 10 already carried the client's `{ type: 'loaded' }` (shape-checked in the client union, ignored by the room)
and `roundStart`'s `epoch` and `startTick`. ONL-18b adds one additive field, `welcome.phase` (`RoomPhase`), as sprint
26 agreed for additive JSON (PF.R33): no protocol bump. Absent from a server before it; the page then falls back to
the welcome's `startTick`, `waiting` and `countdown`, which cannot tell the decided hold from play.

## 3. The room

`RoomOptions.loadBarrierS` (set by the bridge for a game's room; absent in the dedicated and test rooms, whose round 1
stays the owner's countdown) and `onLoadHold`. The launch's round 1 goes through `firstRound`: with a ceiling and
anyone seated, the room stays in `waiting` with a `hold` -- the ids seated now as `pending`, `until` the tick the
ceiling ends -- and tells the bridge, which marks the game launched (active, every seat told `gameLobby` launched, so
the pages leave the lobby and load) from the hold instead of from round 1 (`launchedNow`, once). `launched` reads true
over the hold; `launch` refuses during it.

- A `loaded` (`Room.loaded`) deletes its id from `pending`; the last starts round 1 at once (`roundStart` with its
  `epoch` and `startTick`). One from a spectator, an unseated socket, a duplicate, or outside a hold finds nothing to
  delete: ignored, nothing thrown, nothing sent.
- Each tick of the hold drops a leaver from `pending`, and starts round 1 when `pending` is empty or the ceiling is
  reached; a seat still loading is then spawned with the others and its page joins the running round late.
- *Since ROUND1-COUNT (2026-10-14, research 166 §3; reading, pending review): the barrier's passing -- the last `loaded`
  or the ceiling -- starts round 1 `ROUND1_AFTER_BARRIER_S_READING` (0.5 s) later, the host's own count after its
  barrier (`FUN_001f5e70` D:L55748-55755), not "at once" as the two items above say; the hold stands meanwhile.*
- A side emptied during the hold abandons, as a side emptied in play does (`abandonIfSideEmpty`, `abandon`): the bridge
  ends the game or reopens its lobby by its own rule (`ABANDON_BELOW_PLAYERS_READING`).
- A seat that reconnects during the hold (the session takeover, `Room.takeOver`, a new id for the same seat) is waited
  for under its new id: its `pending` entry moves with it (one line in `takeOver`, outside the launch section; the
  review's finding). Without it the clock dropped the old id and round 1 started while the reloaded page still loaded.
- The idle kick stays off over the hold (`heldLaunch` in `waiting`): a loading page sends no commands.

The tests' raw page sockets (`bridge.test.ts`, `hostHandover.test.ts`, `loadouts.test.ts`, `accountSeat.test.ts`) now
report `loaded` when the launch hands them on, as a page does.

## 4. The ceiling

`LOAD_BARRIER_TIMEOUT_PLACEHOLDER` = 90 s (`bridge.ts`). The original's load state has no timer: its host waits on the
barrier, and a client leaves only on its net layer's failure (`dlgNetError`, `dlgNetAbandoned`; `FUN_001f5e70`
D:L55710-55745; research 179 §6.23). A browser page can stall for good (a hidden tab, a lost worker) without its socket
closing, so the server bounds the hold. The value is borrowed from the original's own stall guard elsewhere in the
match -- the round screens' `TimeoutMonitor`, `WAIT 90` then `dlgNetError.rdr` (research 179 §6.18) -- not read for
the load. A server adaptation, labelled so; the owner may rule another value.

## 5. The page

`LoadingJoin.begin(id, report?)` keeps the load's report and runs it on the frame that returns `released`, once; a
failed or replaced load drops it. `LobbyMatch.start` passes `h.client.reportLoaded()` -- the lobby's client, the same
the match runs on; `main.ts`'s `load` passes the current `NetPage`'s client when it was made for this load (`netLoad`).
`NetClient.reportLoaded` sends on a welcomed open socket, else owes the message to the socket's welcome (the room would
ignore an unseated socket's). Each load reports once; a second match on the same client (the way back to the lobby
and a new launch) is a new load and reports again.

With the barrier the front end's match no longer joins round 1 late (`LobbyMatch.lateBy` null) unless the ceiling ran
out. `SLOW_LOADER_PLACEHOLDER` is retired. `ROUND_EPOCH_PLACEHOLDER` stays named: the page still counts the round from
the `roundStart`'s arrival (now the start within one trip of the socket for every page loaded in time); reading
`roundStart.startTick` against `welcome.tick` / `pong.tick` needs a map from the room's ticks (credited steps, not
wall time) to the page's clock, which the page does not keep -- not small enough for this task.

## 6. The welcome's phase and the bomb's page

`Room.wirePhase` names the state: `waiting` (no round: the sides, the launch or its countdown), `loading` (the hold;
no `startTick` -- no round has begun), `play`, `expired`, `decided` (an elimination's or the bomb's result held before
the round's end), `over` (the round screens). `BombPage`'s welcome now sets in-play from `phase === 'play'` and the
bomb undecided; a later `score` with a counting clock changes nothing, so a joiner in the decided hold neither shows the
bomb's prompt nor predicts a hold the room does not count. `JOIN_DECIDED_PHASE_READING` is retired.

## 7. The late joiner's ARMORY (research 125 §8)

`grenadeSelfMp.spec` runs in `/testroom`, a dedicated room: round 1 is the owner's 10 s countdown, started by the
second seat's hello under that page's loading hold, and the round's start closes a seat's ARMORY (`ARMORY_SEAT_READING`,
W5.R1). The barrier holds only a launched game's round 1, so the test room is unchanged; and it would not keep the
ARMORY even there -- the hold ends on the slow seat's own `loaded`, the moment its screen lifts, and the round's start
then spawns it and closes the screen before DONE can be pressed. In the original the ARMORY is a row of the game lobby
before the load (research 125 §8), so the two never meet; in our lobby path the match opens none (ONL-17). The spec's
DONE stays conditional.

## 8. Placeholders and readings

| name | value | where | what settles it | status |
|---|---|---|---|---|
| `LOAD_BARRIER_TIMEOUT_PLACEHOLDER` | 90 s: the most a launched game's round 1 waits for its pages' `loaded` | server `bridge.ts` | none in the original (no load timer, research 179 §6.23); the owner's ruling, or a capture of the original with a page that never loads | open (a server adaptation) |
| `ROUND_EPOCH_PLACEHOLDER` | the `roundStart`'s arrival; each `score`'s `timeLeft` | viewer `lobbyMatch.ts` | `roundStart.startTick` read against the room's clock (`welcome.tick`, `pong.tick`) | open; re-filed here (§5), first listed at research 166 §6 |
| `SLOW_LOADER_PLACEHOLDER` | joined the running round late | was viewer `lobbyMatch.ts` | the room's held round 1 (§3) | retired 2026-10-06 |
| `JOIN_DECIDED_PHASE_READING` | `'clock-and-bomb'`: a joiner's round read from the welcome's clock fields and the bomb | was viewer `bombPage.ts` | the welcome's `phase` (§6) | retired 2026-10-06 |

## 9. The tests' pins

`roomLoadBarrier.test.ts` holds the hold, the release on the last `loaded`, the countdown's end, the ceiling, a leaver,
a side emptied, each ignored `loaded`, a reconnect (takeover) during the hold, and the welcome's phases.
`bridge.test.ts` holds the hold over real sockets, the ceiling's 90 s (held at 89 s, released at 90 s, on the room's
ticks), and the host leaving during the hold (no SVC-07b hand-over: the game is launched; it plays on with three and
ends below three).

## 10. Deploying: the page and the server together

A page built before the barrier never sends `loaded`. On a server with the barrier, each of its games' round 1 then
starts only at the ceiling, 90 s after the launch. The page and the server ship from the same commit (deploy/README.md,
"Running it").

## 11. What is not done here

- The test room's countdown is not held (§7); research 166 §3's "the same rule covers it" stays the plan of record
  for a later task, with the ARMORY caveat above.
- No capture of the original's load in a network game exists; the barrier is a reading of the code (§1).
