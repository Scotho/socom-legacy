# 264 -- The results path and the ladder's guards: what the room hands over, and how the services apply it (SVC-12d, SVC-07)

- Date: 2026-10-10 (web sprint 22, wave 1; the plan `../plans/2026-10-10-web-sprint-22-the-results-and-the-lobbys-text.md`,
  W22.R1-W22.R3).
- Status: **reading, reviewed** (SVC-12d, SVC-07, SVC-23a, SVC-23b and SVC-23e 2026-10-10; the sprint's Log). Every
  value of the original below is read from the retail decompilation (`socom2_game.elf.decomp.c`, `D:L<n>`,
  `FUN_<addr>`; cited, never pasted); the room's half is unit-tested against that reading and against the room's own
  arithmetic (`packages/central/test/roomResults.test.ts`); re-read by a reviewer who did not write it at each task's
  review (SVC-23e's by dot; the sprint's Log), and nothing here is measured on the original running (ONL-32's Medius log of a whole match is the proven level,
  PROVE-1 the harness).
- Stands on research [155](155-the-stats-record-the-ladder-and-the-ranks.md) (§1.2 the match block, §2.1 the
  calculator's inputs, §4.1-§4.3 the flow, the two results, a leave and a late joiner), [261](261-the-stats-record-and-the-ladder.md)
  (§2 what the room had, §5 SVC-12c's hook and writer, §8 SVC-13a's `RoundResult`) and
  [169](169-security-and-anti-cheat-what-holds-and-what-does-not.md) (§4.2 the result's path, the leaver's round, the
  signals), and does not restate them.
- Code: `packages/match/src/stats/roomResults.ts` -- `RoomRoundResult`, `RoomMatchResult`, `MatchId`, `HandOver`,
  `SeatSignals`, `roundResultOf`, `withRatings`, `ResultsQueue` and the four names of §6; the room's counters and its
  report in `packages/match/src/room.ts` (`RoundOverReport.results`, `.signals`, `.emptied`; `RoomOptions.handOver`;
  `Room.endRound`, `roundReport`, `handOverOf`, `reportEmptied`); the bridge's queue (`GameBridge.results`,
  `GameBridgeOptions.applyResult`, `packages/central/src/bridge.ts`). Section 1 is SVC-12d's; section 2 SVC-07's
  (`packages/central/src/stats/results.ts`, the store's version 2 in `serviceStore.ts`; reading, reviewed 2026-10-10);
  section 3 is SVC-23a's (the ladder's limits, the void and the board's entry: `packages/central/src/stats/void.ts`,
  `packages/central/src/cli/voidMatch.ts`, the store's version 3; reading and the server's own rules, reviewed 2026-10-10);
  section 4 is SVC-23e's (the vote's rejoin refusal through `RoomOptions.onRemoved` and `banFromGame`, and the spectators'
  VOTE ALL in `room.ts`; reading, reviewed 2026-10-10); section 5 is SVC-23b's (the round's signals on
  the ledger, the flags, the measurement of the remaining bounds: `packages/central/src/stats/signals.ts`,
  `packages/central/src/cli/flags.ts`, `packages/central/test/helpers/boundsProbe.ts`; the server's own rules, reviewed
  2026-10-10). §5.6's dated paragraph of 2026-10-11 is SVC-23g's (the restore's marker: `RestoreLine`,
  `ServiceStore.restore` / `pendingRestores` / `settleRestores` in `serviceStore.ts`, `readLedger` in `stats/void.ts`,
  `ResultsWorker.reconcile`; the server's own bookkeeping, nothing of the original's; reviewed, 39788f29e). §5.4's dated
paragraphs of 2026-10-11 are SVC-23h's (the bots that aim at bodies: `BodyAim`, `lookStep`, `torsoPoint`, `downTheLook`,
`aimedClaim` and `BOT_AIM_ADAPTATION` in `tools/mp-bots.ts`; the probe's `hits` and `bestPoint` in `boundsProbe.ts`; a
test instrument's measurement, nothing of the original's; reviewed, f492337e9). §2's "The seats
  told" paragraph's dated part of 2026-10-11 is SVC-07c's (SEAT-TOLD: `GameBridge.seatsTold`, `Room.tellRatings`, the
  protocol's `seatTold` in `packages/viewer/src/net/protocol.ts`, the page's `SeatToldBoard` in
  `packages/viewer/src/net/seatTold.ts`; reading, reviewed, 535a3e06d). §4.5-§4.6 are SVC-23f's (the page's half of
  VOTE ALL; reading, reviewed, 54f7d5597). Each review a fresh reviewer's before the merge (web sprint 18's Log).

## 1. The room's counters and the two results (SVC-12d)

*Added 2026-10-10 (web sprint 22, wave 1; W22.R1). Reading, reviewed 2026-10-10.*

### 1.1 What the room counts, and where it decides

The match block each console counts for its own player (research 155 §1.2) against the room after this task; every
counter is a match total, zeroed with the match (`resetMatch`) and carried by a takeover (the same person,
`TAKEOVER_ROW_READING`):

| block | counter | where the room decides it | the original's writer | standing |
|---|---|---|---|---|
| +0x0c, +0x12 | kills, deaths | `kill` | `FUN_00545290` D:L411473-411513, `FUN_00545d10` D:L411894 | kept |
| +0x14 | suicides | `kill` (no killer, or the victim's own) | `FUN_00545c90` D:L411872-411891 | kept (PF-26) |
| +0x16 | team kills | `kill` (the killer's side the victim's) | `FUN_00545c10` D:L411850-411869 | kept (PF-26) |
| +0x00, +0x04, +0x08 | head shots, hits, shots | `kill`, `countShot` | research 155 §1.2 | kept (PF-26: `HEAD_SHOT_COUNT_PLACEHOLDER`, `HIT_COUNT_READING`) |
| +0x32, +0x34 | primary, bonus objectives | `scoreObjective` | research 155 §1.2 | kept (PF-14, `OBJECTIVE_STAT_KIND_READING`) |
| +0x1c, +0x18 | escortees brought out, killed | the hostages' (HX-5) | research 155 §1.2 | kept (EXTRACTION) |
| +0x38, +0x36 | bombs planted, defused | **new**: `scoreObjective`, on PF-14b's transitions (`plant`, `defuse`), to the planter and the defuser | `FUN_005455d0` D:L411611-411613; `FUN_00545650` D:L411642 | counted in the room |
| +0x3c | the score | every writer above, `endRound`'s +5 and +1 | research 155 §1.2 | kept |
| game +0xf0 (the console's) | the time played | **new**: `endRound`, each round from its start or the seat's seating to the round's end, in ms | `FUN_002ad290` D:L152597; `FUN_002a9b30` D:L150666-150669 | `SEAT_PLAYED_MS_READING` |
| -- | rounds won, lost, drawn | **new**: `endRound`, a round the seat played (not a ghost of it), by the round's winner | the fold reads the sides' wins, `FUN_00225070` D:L76650-76651 | `SEAT_ROUNDS_READING` |

- **The suicides and team kills were already counted.** The roadmap's SVC-12d block ("change the score but are not
  counted") predates PF-26: `kill` counts both beside their -2 (`Player.suicides`, `teamKills`), and research 261 §2
  lists them kept. This task adds no second count; the results read PF-26's.
- **The bombs.** The room now counts its own plants and defuses where it scores them (`scoreObjective`, PF-14b's
  transitions only: a re-sent wire is no transition). SVC-12c's writer still counts its own from the room's bomb by
  account (`MATCH_BOMB_COUNTS_READING`) and folds with it until SVC-07 retires it (W22.R2); the `MatchResult` carries
  the room's. The two counts are of the same transitions; they differ only for a seat that leaves (the writer's count
  stays with the account, the room's goes with the seat, which no `MatchResult` names).

### 1.2 The marks the rating reads

- **A ghost of this round.** The calculator leaves out every player whose actor +0xfd2 is set (D:L76717), the exit
  state's copy of the ghost flag +0xfd1 at the round's end (`FUN_00223970` D:L76148). The room's ghost is a classic
  seat seated while a round is in play (`seatsGhosts`: "You are a ghost. You will play the next round...", the room's
  `FUN_001f97b0` reading); `Player.playsRound` is set for every seat at the round's start (`startRound`), so a classic
  seat whose `playsRound` is not the round's serial is a ghost of it (`ghostOf`). A takeover's new seat is a ghost of
  its round (the room already makes it one: never alive where the old body stood). A respawn room has no ghost.
- **Joined in progress** (`JOIN_IN_PROGRESS_MARK_READING`): the room seated the seat after its match had begun, the
  match's start the reference, never the phase: a classic room's first round started (the room left `waiting`, so the
  launch's load hold is not in progress); a respawn room's match begun a tick before the seat -- its first match plays
  from the room's building, so it begins with its first seat, and those first seats are not in progress (a test); a
  new match clears it; a takeover keeps it. The calculator's test is the player state's +0x43 not -1 (`FUN_002c2dc0` D:L164486-164513, D:L76756), set
  once at the join from game +0xcd (`FUN_002c06a0` D:L163205-163210), which a client sets when its +0xcc is set as it
  connects (`FUN_001f5e70` D:L55715-55717). The meaning of the pair is the reading; +0xcc's setter (D:L149278) and its
  callers are unread.
- **A leaver** is in no later round's result and in no `MatchResult` (its console reaches neither the round's end nor
  the game over); the original's leave also sets the leaver's +0xfd1 on the others (`FUN_002bef60` D:L162534), which
  the calculator skips. What the leaver's own round costs is the owner's (H86 call 7, `LEAVE_COST_PLACEHOLDER`).
  *(2026-10-10, SVC-07's fix round: the call was already ruled -- OT.R33 call 7 (b), `plans/2026-10-02-online-path-target.md`
  :357-361: "a player who quits keeps the match and its history, scored as it stood when he left and folded into the
  record when the server writes the match at its end -- no extra penalty". The leaver is now in the `MatchResult` (§2.3);
  in the rating, as the original, in no calculator of its round or a later one. The name is `LEAVE_COST_OWNER`, the
  owner's value, `'the match kept'`; the `MatchResult` above is the original's, not the room's since that fix.)*

### 1.3 The two results, against research 155 §4.2 and 261 §8

`RoomRoundResult` (one at every round's end) is SVC-13a's `RoundResult` (`stats/rating.ts`) plus the match's id and the
round, `respawn`, `emptied` and, on each seat, the account:

| research 155 §4.2 / `FUN_002253c0` | `RoomRoundResult` | SVC-13a's `RoundResult` |
|---|---|---|
| the match's id | `match` (`MatchId`) | -- |
| the rounds played (game +0x11c, D:L76700) | `roundsPlayed` (= `round`) | `roundsPlayed` |
| each side's round wins (+0x120 / +0x124, D:L76703-76704) | `sealRoundWins`, `terroristRoundWins` | the same |
| the last round's winner (+0x128) | `winner` (`'seal'`, `'terrorist'`, null) | `winner` |
| each seat on a side, in the list's order | `seats`, the room's order | `seats` |
| the account | `account`; `id` its string | `id` |
| the side | `side` | `side` |
| the match score (+0x580, floored by the calculator) | `score`, as the room keeps it (the floor is `ratingsAfterRound`'s) | `score` |
| a ghost of this round (D:L76717) | `ghost` | `ghost` |
| joined in progress (D:L76756) | `joinedInProgress` | `joinedInProgress` |
| a spectator (D:L76690) | `spectator: false` (a watcher has no seat on a side) | `spectator` |
| the published rating | -- the store's: `withRatings(result, ratingOf)` | `rating` |

The rating is the one input the room cannot know: it is the account's stored one, the one the last applied round left
(`RATING_PUBLISHED_REFRESH_READING`), so SVC-07 gives it as it applies the round -- `ratingsAfterRound(withRatings(r,
rating))`, no other shim (a test runs it on the scripted match's round 1).

`RoomMatchResult` (at the match's end) carries, for each seat there at the end, SVC-12a's `MatchBlock` (the counters of
§1.1), the time played (`playedMs`), the rounds won, lost and drawn and the join mark; and the game type (+0x111),
respawn (+0xdc), the rounds played and the sides' wins -- every input of `applyMatch`'s `MatchOutcome` but the LAN valve
(`COME_FROM_LAN_ADAPTATION`), with the seat's own clock for game +0xf0.

- **The match's id** (research 155 §4.2): the room's id (the game's world id, `RoomOptions.handOver.roomId`), the
  match's serial in the room (from 1; a new match at `startRound`'s new match, a respawn room's first at its
  construction) and its start on the room's clock (ms).
- **The order at the match's end**: the `RoomMatchResult`, then the last round's `RoomRoundResult` (the fold in the exit
  state's enter, `FUN_00223970` D:L76078-76082; the rating in its leave, `FUN_002232a0` D:L75798-75805; research 155
  §4.1). The last round's result is handed over once, after the match's.
- **Which rooms hand over** (research 155 §4.1, research 169 §4.2): a room with `handOver` -- only the bridge's game
  rooms, made through the game list -- and only while every seat, a player's or a watcher's, names an account. A map's
  room (`/testroom`, `?mp`) has no `handOver`; a guest's seat makes the round hand over nothing. The report itself
  still comes (SVC-12c's writer reads it).
- **Respawn**: the results are handed over, the rounds marked `respawn: true` -- the round's rating has the fold's two
  conditions (D:L75798, research 261 §3), so SVC-07 skips them, and the `MatchResult` goes under SVC-12c's upload rule
  as today. This departs from the roadmap's acceptance and the plan's Done-when 4 ("a respawn room hands over
  nothing"); the departure is the task's brief's, on its reading that the original's two respawn tests -- the round's
  rating (D:L75798) and the fold (D:L76080) -- both read game +0xdc, so a result marked `respawn: true` lets the caller
  skip it as the original does. The seat amends Done-when 4 and the roadmap block's dated line at the merge.
- **The emptied round** (research 169 §4.2): a classic round in play (or decided) whose side a leave, a kick or a
  demotion empties is reported **before** the room abandons it (`reportEmptied`, then `abandon`, then `onAbandon`):
  `emptied: true`, `matchOver` false, the wins as they stand -- a round in play's none, a decided round's counted at
  its decision (the room abandons on the leave itself, its stand-in: the original's `FUN_002bc530` abandons only a
  late joiner below three, D:L161137-161141, research 315 §3.3; was: "the original abandons on the leave itself,
  `FUN_002bc530` D:L161130-161140") -- its winner the decided
  one, else the side still seated. Under `'none'` its result holds one side only, so the calculator
  moves no rating (D:L76747); under `'counted'` (`roundResultOf`'s branch) the round's leavers, kept with their accounts
  as they left (`noteLeaver`, while the bridge still names them), are counted on their side, `left: true`.

### 1.4 The hand-over, and one writer of the record (W22.R2)

The room calls SVC-12c's hook once a round's end, its report widened (never a second hook). The bridge's game room
hook (`GameBridge.roomOptions`) first enqueues the report's results into the queue the bridge owns
(`GameBridge.results`, a `ResultsQueue`: an array append, O(1) per result), which drains after the tick
(`setImmediate`) to `GameBridgeOptions.applyResult`, one result at a time, in order, a throw logged and the next
applied. A test holds it: a consumer that sleeps 300 ms lengthens no step of the room (the worst under 150 ms) and runs
after, in order.

**Nothing folds twice.** Until SVC-07 the queue's consumer applies nothing (`applyResult` absent in `createServices`):
the career record is still written by SVC-12c's writer alone, from the report's seats at the game over (`MatchEndStats.
roundOver`, unchanged). SVC-07 gives the queue its consumer (the journal, the one store change a result) and retires
the writer **in the same task** (W22.R2 as settled), the writer's unit tests moving to the consumer; the
`RoomMatchResult` carries every counter the writer reads from the report today, the bombs and the seat's clock
included. Until then the writer's store commit still runs inside the hook at the game over -- the commit in the tick
that research 155 §4.2 rules out -- and SVC-07 removes it with the writer.

### 1.5 The signals for SVC-23b (research 169 §4.2)

Each report carries every seat's round signals (`RoundOverReport.signals`, read-outs only, from zero at each round's
start): shots and hits (`countShot`, as `HIT_COUNT_READING` counts them); the hits by the part met (`PART`; -1 a
shotgun's shell, whose pellets meet several); the requests the room refused, by `dropped`'s key, for the seat it names
(the room's own refusals of a command stream, `command: ahead`, `look: turn`, name none and stay the room's tally); the
steps in which the seat ran more than one command (a burst drawn on the credit a stall saved, `CREDIT_MAX`) and the
commands run (`ran`, lost numbers counted as run); and whether a command carried input (the idle kick's `active` test).
The round's length is the report's `roundMs`. No flag is raised here: SVC-23b reads them.

### 1.6 The tests (unit tests only; no browser, no capture)

`packages/central/test/roomResults.test.ts`, on `room.test.ts`'s synthetic floor (`flatRoom`): a scripted match of four
rounds through the room's own decision points -- a team kill and a suicide (round 1), a seat joining 5 s into round 2
and the clock's draw, a seat leaving in round 3, a head-hit kill in round 4 -- each `RoomRoundResult` and the
`RoomMatchResult` equal to the hand count (the scores, the marks, the rounds won, lost and drawn, the time played to the
millisecond); the last round's result once, after the match's; SVC-13a's function run on a result with the store's
ratings given; the room's every event and frame the same with the hook and the hand-over wired or not; a map's room
and a guest's seat hand over nothing; a respawn room's results marked; the emptied round before the abandon; the leave
cost's other branch; the signals by round; the bombs counted where the room scores them; the sleeping consumer; the
bridge's game room naming its seats' accounts and its results reaching `applyResult` after the tick. `room.test.ts`,
`matchEndStats.test.ts` and `bridge.test.ts` unchanged and green.

## 2. The results applied (SVC-07)

*Added 2026-10-10 (web sprint 22, wave 2; W22.R1-W22.R3, W22.R2 as settled by the merge controller). Reading,
reviewed 2026-10-10: every value of the original is cited where it is used; nothing here is measured on the original running.*
Code: `packages/central/src/stats/results.ts` (`ResultsWorker`, `markRefuses`, `markOf`, `notCounted`, `outOfBounds`,
`ResultGame`, `SeatTold`, the names of §6 and the moved names of research 261 §6), `packages/central/src/serviceStore.ts`
(`SERVICE_STORE_VERSION` 2, `SERVICE_DB_SCHEMA` 3, `MIGRATION_BACKUP_FILE`, `ResultMark`, `AuditEntry`,
`ResultChange`, `migrateDocument`, `applyResult`, `accountsResults`, `reload`, `revision`), `packages/central/src/bridge.ts`
(`createServices`'s worker; the game's `MatchTrack`, `roundStarted`, `noteResults`), `packages/central/src/ladder.ts`
(`LadderService.markStale`, the order kept against the store's revision). Retired: `packages/server/src/stats/matchEndStats.ts`
(SVC-12c's writer) and its test file, the cases moved (§2.7).

### 2.1 The schema's version 2 and its migration (research 155 §4.2, §4.4)

- **Each account gains two fields** (`AccountRecord.lastResult`, `.lastAudit`): the mark of the last result applied to
  it (`ResultMark`, §2.2), null before the first, and the audit entry of the result that set it (`AuditEntry`, §2.6),
  null with it. The whole-document check holds them: a mark of the shape, an entry whose mark is the account's mark and
  whose account is the account; a change that breaks either is refused `format`.
- **The store has been SQLite since OT.R37** (research 220), so research 155's "a version 1 file" is three things now,
  each migrated explicitly and once, never silently (R131): (1) **the database** -- schema 3 (`SCHEMA_V3`) adds the two
  columns as JSON text, NULL in every row a version 1 store wrote (no mark, no entry); before it runs, the open writes
  **`services.v1.backup`** beside the database (`MIGRATION_BACKUP_FILE`; research 131 §5's format -- the format line
  with the body's SHA-256 -- at the document's version 1, the records as that store held them), inside the open's write
  lock, so a backup that cannot be written migrates nothing; (2) **a legacy `services.json`** at version 1 -- imported
  through `migrateDocument` (each account `lastResult: null`, no entry) and, as before, never written: it stays its own
  backup; (3) **a backup** at version 1 -- restored through the same `migrateDocument`. A version 2 store is untouched
  by an open (the schema's rows, the generation and the backup file as they were: a test); a version 3 document, a
  version 3 backup and a schema above 3 are refused (`corrupt`). Research 155 §4.2's `serviceStore.ts:19-20` is the
  JSON store's line before OT.R37; the constants are now `SERVICE_STORE_VERSION` (the document and the backups) and
  `SERVICE_DB_SCHEMA` (the database).
- **The old databases in the tests**: a real schema 1 database (`test/fixtures/schema1.sql`, written by the store before
  schema 2, NET-DRAIN's fixture) migrated through 2 and 3 at one open, its backup at version 1; and a schema 2 database
  reproduced by dropping schema 3's two columns and its version row from one made now (`toSchema2`,
  `serviceStoreMigration.test.ts`). `sessionsPersist.test.ts`'s two schema 1 cases now expect `SERVICE_DB_SCHEMA`.
- **The store's operations** (research 155 §4.4 (1)): `applyResult(changes)` -- several accounts' records (absent: as
  stored), marks and entries in one change, all or nothing; `accountsResults()` -- the accounts holding a mark (the
  ledger's reconciliation, §2.6); `reload()` -- the database re-read in place after another writer moved it (§2.4), so
  every service holding the store sees the new rows; `revision` -- moved by every change and reload (§2.7's ladder).

### 2.2 The queue and the mark (research 155 §4.1-§4.2; research 169 §4.2)

- **The journal** (`results.journal` beside the store): each result the bridge hands over (`GameBridge.results`' drain,
  after the room's tick -- SVC-12d's seam, research 264 §1.4) is appended as one JSON line -- the queue's counter, the
  result, its game (`ResultGame`, §2.3) -- and synced before it is applied; the head is dropped (the file rewritten
  with what is still queued) once applied; at open the lines are queued again in order and applied. A torn last line (a
  crash in its write) is dropped; an unreadable line before it goes to the dead letters (§2.4). One worker
  (`ResultsWorker.pump`), one store change at a time; a result handed over while the worker waits on a failing store
  waits behind it.
- **The counter, not the clock** (research 169 §4.2 (3)): each result is given `seq`, one above the last; at open the
  counter starts above every stored mark and every journaled result -- a counter kept in the store's marks, so a clock
  set backwards changes nothing. The match's start time stays in the mark for people.
- **The mark** (`ResultMark`: `seq`, the room's `MatchId`, the round or `'end'`, the rounds played): a result is refused
  whole, changing nothing, when any account it names holds a mark at or above it (`markRefuses`): in the same match, a
  place at or below the stored one; in another match, a counter at or below the stored one. So a result handed over
  twice, or replayed from the journal after its commit, is harmless, and one out of order is refused (tests).
- **The order within a match** (research 155 §4.1): the original's game over folds in the exit state's enter
  (`FUN_00223970` D:L76078-76082) and rates the last round in its leave (`FUN_002232a0` D:L75798-75805), and SVC-12d hands
  over the `MatchResult` then the last round's `RoundResult`. Research 155 §4.2's ordering ("`end` above every round")
  would refuse that last round's rating behind the fold's mark; the mark places the fold of an N-round match between
  round N-1 and round N (`within`: round r at 2r, the fold at 2N - 1), so the last round is rated once, after the fold.
  *A correction to research 155 §4.2's sentence, not to its flow.*
- **Which accounts carry it**: every account the result names -- a ghost of the round included, whose record is not
  written (its result is 0: the calculator leaves it out, D:L76717, and only a result above 0 is written, D:L75801); a
  watcher is named by no result (research 264 §1.3).

### 2.3 The guards before a result is computed (W22.R3)

Each result is journaled with its game as the bridge knew it at the hand-over (`ResultGame`; `MatchTrack` in the
bridge: the players seated at the match's start -- the room's `stats().players` at `onRoundStart(1)` -- each side's
seats at the round's start, each seat's kills at the last round's end), so a replay at open needs no live room.

| guard | rule | source | level |
|---|---|---|---|
| respawn off | a result with `respawn` is not counted (the rating's and the fold's caller skip it) | game +0xdc, D:L75798, D:L76080 (`uploadsAfter`) | reading |
| no LAN game | `ComeFromLan` never set for our rooms | `FUN_003045b0` D:L204495-204507; `COME_FROM_LAN_ADAPTATION` (moved here, research 261 §6) | adaptation |
| five at the start | `countsForLadder(playersAtStart)` | OT.R33, H168 (SVC-13's `LADDER_MIN_PLAYERS_AT_START`) | the owner's rule |
| password games | counted (`'counted'`) | H86 call 2, the sprint's H-next a: `LADDER_PASSWORD_GAMES_PLACEHOLDER` | placeholder |
| a leave | the match kept: the leaver's seat in the `MatchResult` as it stood when it left (its counters, its rounds, its time through its last round's end, and `stood` -- the rounds completed and the sides' wins then, which its fold reads, `roundsOf` D:L76650-76651), folded at the end; in the rating, in no calculator of the round it left or a later one (research 155 §4.3) | OT.R33 call 7 (b) (`plans/2026-10-02-online-path-target.md`:357-361): `LEAVE_COST_OWNER` -- `Room.noteLeaver`, `matchSeats` | the owner's rule |
| the rating | SVC-13a's `ratingsAfterRound` over `withRatings` (the stored ratings), unchanged (W10.R2) | research 261 §8 | reading |

A result that does not count changes nothing and sets no mark; the worker logs why. **The fold is gated as the rating
is**: a game of four or fewer at its start folds no career counters, where SVC-12c's writer folded every game over with
respawn off (the original folds every online game with respawn off, D:L76080-76081). This is the owner's ruling, not a
reading: research 155 §6 call 2 (LADDER-COUNTS, :640) asks "which games move the rating **and the record**", and OT.R33
answers it with the five at the match's start (`plans/2026-10-02-online-path-target.md`, OT.R33, call 2, and call 3 "the
same rule, no smaller game counts"; H168 confirming the five). *(Closed 2026-10-10 on review; it was left as a question
in this section's first draft.)*

**A leaver's match** (OT.R33 call 7 (b), `LEAVE_COST_OWNER`): the room keeps each seat that leaves a begun match --
its match seat as it stood (`Room.noteLeaver`, `matchLeavers`, cleared with the match) -- and hands it over in the
`MatchResult` at the match's end (`matchSeats`): a seat that left and is not seated then is added as it stood, with
`stood` (the rounds completed, a decided round among them, and the sides' wins at its leave) in place of the match's
end for its fold's rounds; an account that left and sat again has its kept match added to its new seat's. The fold
applies to it as to the rest; in the rating it is in no calculator of the round it left nor of a later one, as the
original's leaver (research 155 §4.3). The original's leaver folds nothing at all (`FUN_00223970` folds at the game over
only): the kept match is the owner's departure. Tests: `roomResults.test.ts`'s scripted match (Charlie, gone at round 3's
start, in the `MatchResult` with rounds 1-2) and `results.test.ts` (a seat quitting at round 2's start folded at the end
as it stood, in round 1's calculator and no later one).

### 2.4 A commit that throws (research 155 §4.2)

- **`stale`** (another writer moved the database: a restore, another process): the store re-read in place (`reload`)
  and the result planned and committed again at once; a second `stale` in a row is handled as an I/O failure.
- **An I/O failure** (any other throw: a full disk, a permission, `busy`, `corrupt`, a closed store): the result kept at
  the queue's head, later results waiting behind it, the operator told by an error line (`results store failing`), a
  retry after `RESULTS_RETRY_FIRST_MS` doubled each failure up to `RESULTS_RETRY_MAX_MS` (1 s to 60 s, a server
  policy: no original).
- **A refusal of the change itself** (`format`, `width`, `not-found`, `taken`, `full` -- a bug, or an account gone):
  the result appended to `results.dead` beside the journal (the line, why and when), the operator told, the next
  applied. A retry is safe because of the mark: a result in fact written before its failure was reported is refused.
- Tests: each with a stub store that throws it once (`results.test.ts`).

### 2.5 The bounds on the room's own result (research 169 §4.2; `RESULT_BOUNDS_ADAPTATION`)

Out of bounds, a counted result goes to the dead-letter file, never the ladder: one account on two seats (a seat on
both sides), in a round or a match; a classic round's seat with more kills in the round than the opposing side seated
at the round's start (a classic round kills each opponent once; the room's `kill` counts enemies only, team kills apart,
`room.ts` PF-26); a classic round ended under `RESULT_ROUND_MIN_MS` (15 s: research 169's "the 15 s the round's own
script watches nothing in"; the room's watches are 13-15 s by game type and the decided round's hold follows them). A
round a leave emptied is not held to the length: it is reported at the leave (research 264 §1.3). In one process the
bounds catch bugs only (research 169 §4.2). A test each (`resultsNegative.test.ts`).

### 2.6 The audit ledger (research 155 §4.2)

- **One line a result and account** (`results.audit`, append-only, synced; the game never reads it), appended after the
  commit: the mark, the account, the kind, when (ms, for people), the game (`ResultGame`), the account's part of the
  input (its seat of the `RoundResult` with the sides' values, or of the `MatchResult` with the game's), and what puts
  the record back -- a round's rating before and after (and the calculator's result); a fold's every summed counter's
  before-value and amount, the two fields that are no sums (the bonus objectives, replaced; the hit percentage, a
  running mean) and the games count before and after.
- **Reconciled at open**: each account keeps its line's entry as `lastAudit` inside the commit; an account whose entry's
  mark is not the ledger's last line for it has the entry appended. A crash injected between the commit and the append,
  then an open: the line exactly once (a test). The ledger is read whole at open (one entry kept an account); its
  retention is SVC-04's call (`RESULT_AUDIT_RETENTION_PLACEHOLDER`, research 155).

### 2.7 One writer of the record (W22.R2), the ladder, the seats

- **SVC-12c's writer retired**: `stats/matchEndStats.ts` (`MatchEndStats`, `matchBlockOf`) is gone; the fold is the
  queue's (`plan`'s `applyMatch` over the stored record, the `RoomMatchResult`'s seat as the match block). Its names
  moved into `results.ts` with their rows kept (research 261 §6): `MATCH_CLOCK_TOTAL_READING` (the fold's +0xf0 is now
  the seat's own `playedMs`, the rounds' clocks for a seat seated through the match), `MATCH_BOMB_COUNTS_READING` (**one
  count**: the room's, where PF-14b scores the bomb's transitions, to the actor's seat; the bridge's tally by account
  and its `watchBomb` gone) and `COME_FROM_LAN_ADAPTATION`. The record's writers outside the tests are now two: the
  queue's consumer (`ServiceStore.applyResult`) and OPT-15's owner-fields operation (`setAccountStats`, the description
  only); `writeAccountStats` is the tests' seeding.
- **Its tests moved** to `results.test.ts`, each still asserting the record's bytes: research 261 §5.5's hand-computed
  case (Alfa from the default record, Bravo onto a record of three games at 50 %; the watcher writing nothing), through
  the room's own `RoomMatchResult` with five accounts seated (OT.R33) -- the same 256 bytes as before; the next match's
  own sums (the seat's clock and the bombs zeroed with the room's match); respawn writing nothing; the MP72 bridge case
  (a plant and a defuse through the room's own bomb, folded once to each account; the same results handed over again,
  refused). The case "a seat without an account writes nothing" became SVC-12d's "a guest's seat hands over nothing"
  (`roomResults.test.ts`).
- **The ladder's order** (research 155 §4.4): kept in memory against the store's revision and rebuilt when stale;
  `markStale()` after every result applied (and for a caller whose change the revision does not show, a ban's source).
  Research 261 §9.3's "computed at each ask" is now "kept until stale"; the answers are the same.
- **The seats told** (`SEAT_RATING_TOLD_PLACEHOLDER` until SVC-07c; now `SEAT_TOLD_BETWEEN_ROUNDS_READING`): after a
  round, each seat's new rating and medal (`medalOf` at its standing) are computed and handed to `tell` -- in
  `createServices` a log line. The values are the in-game player state's (+8 the published rating, refreshed by
  `FUN_002c5360` D:L166208-166209; +0x42 the medal, D:L166200-166201, forced to 4 for the name `oop9`,
  D:L166202-166205; research 155 §2.3, §4.4). *(Corrected on review:
  the first draft named ONL-16, which is the game lobby's chat half only, W22.R5.)*
  *2026-10-11 (SVC-07c SEAT-TOLD, web sprint 18 W18.R3; reading, reviewed):* `tell` also hands the told seats to
  the bridge (`GameBridge.seatsTold`, the one path), which names each account by its seat in the result's game
  (`match.room`; the account id stays on the server) and drops an account no longer seated there -- only for the live
  room's own match (`Room.currentMatch`: its serial and start; a game id is the room service's counter in memory, so a
  journaled result retried after a restart can name a new game of the same id, and is logged, not sent); the game's room
  sends one `seatTold` server event (`Room.tellRatings`; protocol 11 kept, an additive kind: `{ type: 'seatTold';
  seats: { id, rating, medal }[] }`) to every socket of the game, players and spectators alike, and into its
  recording (`broadcast`; the replay's fold classes it stateful since the join refresh below: the last one behind a
  seek's target is told after the score, as a joiner hears it after its welcome; with none behind the target an empty
  one, so a seek back leaves a board none of the later pairs -- the re-review's B). A respawn round is not counted, so none is sent (the queue's limit; the bridge refuses one
  too). The medal is the one the seat publishes: the name `oop9` (S:0x3f2a88; compared by `FUN_00198f18`, a strcmp,
  whole and case-sensitive, D:L15847-15859) forced to 4 (`FUN_002c5360` D:L166202-166205; `publishedMedal`,
  `OOP9_MEDAL_NAME_READING` for which name is compared), applied by the bridge where the seat's name is known. The page
  keeps each seat's last told pair, replaced whole by each event and never by anything it sends
  (`SeatToldBoard`, `packages/viewer/src/net/seatTold.ts`, on the net client's event feed, held by the page's client as
  `NetClient.told` and closed with it; ONL-34 draws the medals from it; nothing draws it yet). The values are the
  queue's; what stays unread is the original's carriage of them between rounds -- which message each console publishes
  its player state in, and when after the round (`SEAT_TOLD_BETWEEN_ROUNDS_READING`, §6): the event's timing, at once
  after the round is applied, is a server rule. ~~Not done here: a seat joining between rounds is told nothing until
  the next round's event (the welcome carries no told pair; research 155 §4.4's "when a seat joins" refresh is the
  record as the lobby serves it).~~ *(2026-10-11, SVC-07c's review 2: built.)* The refresh at a join (research 155
  §4.4; W18.R7): when a seat is seated in a game's room (the bridge's `seated`), the same event goes to every socket of
  the game, and every event -- a join's or a round's -- names **every player seated in the game now** (a watcher hears
  it and is no entry: `SEAT_TOLD_PLAYERS_ONLY_READING`, the re-review's A), each at its
  pair as the server holds it (`seatToldOf`: the stored rating and `medalOf` at its standing, the queue's own
  computation; 0 off the board), a round's told seats at the queue's values: the joiner learns everyone's pair, the
  others the joiner's, and the page's board keeps its replace rule (each event is the whole game's). A game none of
  whose rounds is counted (respawn, or under OT.R33's five) tells them at its joins. A seat with no account has no
  entry; a game's seats are all accounts' (the hello's ticket).
- **A finding (owed; `LADDER_ENTRY_PLACEHOLDER`)**: OPT-15's owner-fields write of a never-played account's description
  stores the default `'E'` record with the text (as the original's login posts it, `FUN_002fa8f0` D:L198403-198405), and
  the board's entry is "a written `'E'` record" -- so that account appears on the board at 1000 without a counted round
  (OT.R33 call 5 (b)). The negative test holds it as a failing case (`it.fails`, `resultsNegative.test.ts`; the
  scenario and its preconditions asserted in the case before it, so a broken create, login or write never passes as the
  finding). The fix this task did not make, named for SVC-23a's brief (§7): a one-way "rated once as a non-ghost" flag
  the queue sets, the board reading it -- exact per call 5 (b); `lastResult` alone would seat a ghost of a round or a
  seat with a fold only.

### 2.8 The negative test (research 169 §4.2)

`resultsNegative.test.ts`, over the fixtures' MP72 with five accounts seated in a launched game and each holding a
record: every `ClientEvent` type -- read from `protocol.ts`'s union, comments stripped, and checked against the test's
samples, so a type added there fails the test until it is swept -- sent from a seated page; and every mounted HTTP path
-- the handlers' exported lists, checked against every `/account/`, `/lobby/` and `/clan/` path their sources name --
posted with a hostile body (a record, a rating, counters, ladder stats) and an empty one by a seated account, `/account/
logout` last, and the match server's own GET paths: after each, every record's rating and career counters, every mark
and the board as before. A unit test, not a capture; the binary command frames are not swept (they carry no field a
record reads).

### 2.9 The tests, and what ONL-32's transcript through PROVE-1 would prove

Unit tests only (no browser, no capture): `serviceStoreMigration.test.ts` (10), `results.test.ts` (22; the MP72 case on
the in-tree fixture), `resultsNegative.test.ts` (8, one `it.fails`), `ladder.test.ts`'s order case;
`serviceStore.test.ts`, `serviceStoreSqlite.test.ts` and `sessionsPersist.test.ts` at the new versions. **Nothing here is proven.** ONL-32's Medius
transcript of a whole match on the local stack, scored by PROVE-1 against the same match replayed in the room, would
prove the values this path writes: each round's `AccountUpdateStats` post (Lobby 0x11, R155.4) against the record after
that round's result (the rating, the join-in-progress half, the ghost left out), the game over's post against the record
after the fold (the 256 bytes: the clock total's rule, the bombs' attribution, the fold's arithmetic), and the order of
the fold and the last round's rating. What no capture proves: the queue, the mark, the journal, the ledger and the
bounds are the server's own -- held by the tests above.

## 3. The ladder's limits and the void (SVC-23a)

*Added 2026-10-10 (web sprint 22, wave 3; W22.R3, W22.R6; the brief `../plans/briefs/2026-10-10-s22-w3-svc-23a.md`).
Reading, reviewed 2026-10-10, where a value is the original's; everything else here is the server's own rule, listed as a
deviation (§3.5). Nothing is measured on the original running.* Code: `packages/central/src/stats/results.ts`
(`excludedBy`, `LimitName`, `ExcludedLine`; a round's change `rated`, its entry's `firstRated` and `blank`),
`packages/central/src/stats/void.ts` (`voidMatch`, `reconcileVoids`, `readLedger`, `ledgerMatches`, `VoidLine`,
`VoidAccount`, `VoidRefused`, `VOID_AUTHORITY_PLACEHOLDER`), `packages/central/src/cli/voidMatch.ts` (the operator's
tool), `packages/central/src/serviceStore.ts` (`SERVICE_STORE_VERSION` 3, `SERVICE_DB_SCHEMA` 4, `MIGRATION_BACKUP_V2_FILE`,
`AccountRecord.ratedOnce`, `VoidRecord`, `VoidChange`, `applyVoid`, `voids`, `ratedInLedger`, `voidKey`;
`RESULTS_AUDIT_FILE` moved here and re-exported by `results.ts`), `packages/central/src/ladder.ts` (`LADDER_ENTRY_OWNER`,
`onLadder` over the flag, `bannedAccounts`). Tests: `packages/central/test/void.test.ts` (21, three of them the
review's, 2026-10-10), `serviceStoreMigration.test.ts` (14, one the review's), `resultsNegative.test.ts`'s finding case turned into a passing assertion; the
seeding helper `test/helpers/ladderSeed.ts`.

### 3.1 The limits, applied before a result is computed (W22.R3)

SVC-07's guards (§2.3) are the hook; SVC-23a confirms each ruled limit there and gives each exclusion its line. A result
a limit excludes changes no record, sets no mark and no flag, and leaves **one ledger line** (`results.audit`,
`ExcludedLine`): `kind: 'excluded'`, the queue's counter, the result's kind, match and round, the limit, why, the
accounts it named, the game as journaled, when. The line has no account and no mark at its top level, so the open's
reconciliation (§2.6) passes it by; the operator's log line is kept beside it.

| limit (`LimitName`) | rule | source | level | test |
|---|---|---|---|---|
| `respawn` | respawn on: not counted (and a LAN game, never set for our rooms) | the original's: game +0xdc and `ComeFromLan` (`FUN_003045b0`) both tested before the rating (`FUN_002253c0` called only under them, D:L75798) and the fold (D:L76080-76081); `COME_FROM_LAN_ADAPTATION` | reading; the LAN half an adaptation (the branch unreachable: no test can raise it, `excludedBy` answers null for a LAN-free round) | `void.test.ts` "respawn on", "no LAN game" |
| `players` | under five at the match's start: not counted, rating or fold | OT.R33 calls 2 and 3 (`plans/2026-10-02-online-path-target.md`:354-361), H168; `countsForLadder` | the owner's rule | "four at the match's start" |
| `password` | counted (the ruling: "All games count", public or password); the other value excludes it with a line | OT.R33 call 2; `LADDER_PASSWORD_GAMES_PLACEHOLDER` kept for the one-line flip (§6) | the owner's rule; the flip a placeholder | "a password game as LADDER_PASSWORD_GAMES_PLACEHOLDER says" |
| a leave | not a limit: the quitter's match kept, folded at the end as it stood; in no calculator of its round or a later one | OT.R33 call 7 (b), `LEAVE_COST_OWNER` (§2.3) | the owner's rule | `results.test.ts` (SVC-07) |
| the banned | off the board and out of the total; the seam `bannedAccounts()` (no writer: the store holds no account ban until SVC-23's), read by the board (`LadderService`'s default `banned`) and the void (its line marks a banned account restored, still off the board) | OT.R33 call 11; `LADDER_BANNED_SOURCE_PLACEHOLDER` (research 261 §6) | the owner's rule; its source a placeholder | "a banned account off the board and out of the total" |
| the bounds | an account on two seats, kills above the opposing seats, a classic round under 15 s: to the dead-letter file with `why` (§2.5) | `RESULT_BOUNDS_ADAPTATION` | adaptation | `resultsNegative.test.ts` (SVC-07) |

Not built here: the roadmap block's "the audit ledger's note when both sides' seats share an address" -- the results
carry no address (`ResultGame`), and research 169 §5 makes the note weak evidence both ways; it belongs with SVC-23b's
signals (§7).

### 3.2 The board's entry: rated once as a non-ghost (OT.R33 call 5 (b), `LADDER_ENTRY_OWNER`)

The follow-up §2.7 named. Each account gains a one-way flag, `ratedOnce` (the store's document version 3, schema 4):
set inside the round's own change, with its mark, when the calculator rates the seat above 0 (`ResultChange.rated`) --
a seat on a side and not a ghost of the round (actor +0xfd2, D:L76717), the result above 0 the only one written
(D:L75801); never cleared by a result. The board reads it (`onLadder`) instead of the record's first byte. So a ghost of
every round it sat, a seat with a fold only, and a never-played account whose description OPT-15 wrote (an `'E'`
record) are off the board and out of the total; `lastResult` alone would have seated the first two. The round's entry
says which result set the flag (`firstRated: true`, for the ledger's reader: the void derives the flag again from the
rated rounds that survive, §3.3), and every entry whether the account's stored record was one the server had written
(`blank: true` when not) -- what a void needs to put a blank record back byte for byte.
`LADDER_ENTRY_PLACEHOLDER` ("a written record") is replaced by `LADDER_ENTRY_OWNER` = 'from the first counted round'
(research 261 §6, §9.3; research 101 §5). `resultsNegative.test.ts`'s `it.fails` case is a passing assertion now.

**The migration** (research 155 §4.2's rule for a schema change, as SVC-07 did, §2.1): a schema 3 database is backed up
to `services.v2.backup` (research 131 §5's format at the document's version 2, written inside the open's write lock,
never again), then migrated once: schema 4 adds `rated_once` (0) and the `voids` table, and the same transaction sets
each account's flag from the audit ledger beside the store (`ratedInLedger`: a round's line whose calculator result is
above 0), or from its last audit entry (a line a crash cut that no open has reconciled). Exact for every rating ever
applied: SVC-07's queue is the only rater (SVC-13a's arithmetic had no caller before it), and each rating left a line.
A version 2 document (a backup, a legacy file) is migrated as it is read, the flags from the ledger in the data directory
it is restored into -- for a backup, only the lines at or below each account's restored `lastResult` counter (the
ledger can hold ratings made after the backup, which must not flag a record that predates them; the review's fix,
2026-10-10, a test); a version 1 one through version 2 the same way. A version 3 store is untouched by an open; a
version 4 document and a schema above 4 are refused. **Seeding**: the tests that seed a ranked account
(`ladder.test.ts`, `rankGate.test.ts`, `results.test.ts`'s board case, `resultsNegative.test.ts`) write it through a
result's change with `rated` (`writeRatedStats`, a seeding match of room 0) -- the helper, not the room's rig;
`writeAccountStats` alone now leaves an account off the board (a test).

### 3.3 The void of a match (research 155 §4.2 "What a void can and cannot restore")

**From the ledger, newest first.** The operator names a match (its room, serial and start); `voidMatch` reads its lines
from `results.audit` and takes its results out of every account it named, by the queue's counter descending (the last
round, the fold, the earlier rounds). Per account and per field:

| field | no later change | a later result, or an earlier void made after the match's lines | named in the line |
|---|---|---|---|
| the rating | the match's first round's before-value | the rating less the match's own changes (its rounds rated above 0), floored at `RATING_FLOOR` (200, `FUN_002397f0` D:L86052-86055) | `restored` / `subtracted`, `ratingFloored` |
| the twelve summed counters, the games | the fold's before-values | the current values less the fold's amounts (exact: they are sums) | `restored` / `subtracted` |
| the bonus objectives | the fold's before-value | kept: a later fold replaced them (D:L76635-76636), or the before-value holds the older match's fold the earlier void took out | `notRestored`, with the later result or the void |
| the hit percentage | the fold's before-value | kept: a running mean a later fold rounded over the voided match's (D:L76637-76641), or one whose before-value holds the older match's fold | `notRestored`, with the later result or the void |
| the rated-once flag | when the match rated the account: kept while a round of a match neither this one nor voided rated it, else unset; a void never sets it | the same | `ratedOnce` from / to |
| the record's bytes | a record that was blank before the match (`blank`) and restores to the default record gets its zero blob | -- | -- |

"Later" for an account is a result applied after the match's first result for it, of another match, not taken out by
an exact void before; a later round changes the rating only if it rated the account above 0, a later fold the rest.
**An earlier void made after the match's lines** counts as a later change too, per field it moved: the void of an
older match whose `later` names one of this match's results took that match's change out after this match's lines were
written, so the before-values in them still hold it. Two voids, the older match first: the older one is partial (the
newer came after it), and the newer one, with no later result, subtracts instead of restoring its before-values, which
would bring the older match's change back (the review's finding, 2026-10-10; a test, with the newer-first order, both
exact, beside it). The line names those voids (`laterVoids`).
An account whose fields all went back is `restore: 'exact'`, else `'partial'`; the void is `'exact'` when every
account is. **Nothing is recomputed**: the later rounds' expectations were computed from the voided ratings, and the
other players they moved keep what they got (a test); a full recomputation is the owner's to ask (call 12), never
automatic. The marks stay (a voided result is never applied again).

**The void's line** (`VoidLine`, appended to the ledger; `kind: 'void'`, no account or mark at its top level): the
match, when, **who, why and the evidence** (free text, all three required: `VOID_AUTHORITY_PLACEHOLDER`), the
authority, `exact` or `partial`, the results taken out newest first, and each account's part -- the results undone, the
later results, every restored field `from` / `to`, `restored`, `subtracted`, `notRestored` with why, the flag, whether
banned -- `ladder: 'marked stale'`, `recomputed: false`.

**One change.** The accounts' records and flags and the void's record (`VoidRecord`: the match, when, the whole line)
in one store change (`ServiceStore.applyVoid`), so a match is voided once (`taken` -> refused `already-voided`); the
line appended to the ledger after the commit, and appended from the store when a crash cut it (`reconcileVoids`) at the
tool's next open -- every run of `cli/voidMatch.ts` but a dry run, `--list` included, reconciles first, and a void
before it plans; the match server's open does not (it writes no void). Tests inject the crash, the line appended once by
the next `--list`. The ladder's order is marked stale (the store's revision moves too).

**Refused, nothing written** (`VoidRefused`, a test each): no author, reason or evidence (`incomplete`); results still
in `results.journal` (`journal-pending`: applied after the void they would be later results it never saw -- start the
server once, stop it, void); a match voided before, in the store or in the ledger (`already-voided`); a match the
ledger does not hold (`not-in-ledger`); an account whose mark in the store is not its last line in the ledger
(`ledger-behind`: a line a crash cut, not yet reconciled by an open -- the void never works on a short history; or, the
ledger's last line above the store's mark, a store restored from an older backup, which no open mends, §5.6).

**The operator's tool** (H-next c and f, on their defaults): `packages/central/src/cli/voidMatch.ts`, over the data
directory with the server stopped (research 220 §3: one writer process; a server still running would meet `stale`) --
`--list` the ledger's matches, `--dry-run` the line computed and nothing written, the void, exit 1 on a refusal and 2
on a usage error before the store is opened. No page, no HTTP path, no bearer. Its build and use are
`deploy/README.md`'s "The void of a match".

### 3.4 Who voids, on what evidence (H86 call 12; the plan's H-next c)

The one open call, on its default: `VOID_AUTHORITY_PLACEHOLDER` -- the operator with the data directory's access, by the
CLI over the ledger; the evidence a free-text note in the void's line; a flag (SVC-23b's) or a report is evidence for a
void, never a void by itself (research 169 §5); no automatic void; the partial restore, never a recomputation. OT.R33
names call 12 among the calls on research 155's recommendation ("(b) on the ledger's evidence plus a named report ...
no automatic void; (i)"); its "moderators you name" needs a role SVC-23 has not built, so the operator alone holds the
tool until the owner answers.

### 3.5 The deviations (OT.R26 / OT.R27; SVC-23's acceptance)

Every rule here but the respawn / LAN condition, the ghost's exclusion and the rating floor's value is the server's:

1. **The five at the start, the password flip, the kept quitter, the banned off the board** -- the owner's rules
   (OT.R33), not the original's, which counts every online game with respawn off (research 155 §6 calls 2, 3, 7, 11).
2. **The exclusion's ledger line** -- the original kept no ledger (each console posted its own record).
3. **The board's entry from the first counted round** -- the owner's (call 5 (b)); the original's client ranked every
   account from its first login at 1000 (`FUN_002faa80` D:L198403-198405).
4. **The void** whole -- the original has none; its two cases and what a line restores are research 155 §4.2's design.
5. **The floor on the partial restore** -- the calculator's own floor applied to a subtraction it never makes; a
   rating under 200 is one the original cannot hold.
6. **The flag cleared by a void** -- one-way for every result; a void that takes out a round that rated the account
   derives it again from the rated rounds that survive in matches not voided, and clears it when none does (an account
   with no counted round left is off the board, as before its first).
7. **The CLI's preconditions** -- the server stopped, the journal empty, the ledger in step: the server's own safety.

## 4. The vote's rejoin refusal and VOTE ALL (SVC-23e)

*Added 2026-10-10 (web sprint 22, wave 3; W22.R6; the brief `../plans/briefs/2026-10-10-s22-w3-svc-23e.md`; the two
parts of the original's vote that SVC-23's close owed, research 263 §5.3 and §7). **Reading, reviewed 2026-10-10** (by dot): every
value of the original below is read from the retail decompilation (`socom2_game.elf.decomp.c`, `FUN_<addr>`,
`D:L<n>`; strings by address, `S:0x...`, checked against the ELF's bytes), our Horizon at the pin
(desktop@be557831); nothing is measured on the original running -- ONL-32's rejoin transcript and the recomp's vote
run are the proven level.* Code: `packages/match/src/room.ts` (`RoomOptions.onRemoved`, told in `applyVotes`; VOTE
ALL's block after it -- `voteAll`, `ejectSpectators`, `spectatorsEjected`, the `voteAll` event, the leave's clear in
`drop`, the refusal in `hello`; `VOTE_ALL_SHARE`, `VOTE_ALL_LINE_PER_SPECTATOR_READING`, `TOO_MANY_SPECTATORS`),
`packages/central/src/bridge.ts` (the game rooms' `onRemoved`; `VOTE_ALL_LISTED_SLOTS_PLACEHOLDER`),
`packages/central/src/lobby.ts` (`banFromGame`'s caller; `GAME_BAN_LIFE_PLACEHOLDER`),
`packages/viewer/src/net/protocol.ts` (the client's `voteAll`, the server's `spectatorVote` and `spectatorsEjected`,
additive under protocol 11; `SPECTATOR_VOTE_FORMATS`, `SPECTATORS_EJECTED_TEXT`, `spectatorVoteText`),
`packages/viewer/src/replay/fold.ts` (the two events classified transient).

### 4.1 The rejoin: the hook, the lobby's answer, Horizon's

**The original.** The removed player's own console asks its ban as ROUND COMPLETE or GAME COMPLETE starts
(`BanSelfFromGame`, `FUN_00278d30` D:L123707 -> `FUN_002f95f0` D:L197800-197804: MediusBanPlayer with its account, a
field of 120 whose unit is not read, and the game's world; research 179 §6.3, research 263 §5.2), and the server then
answers that account's JoinGame to that game -972 `MediusPlayerBanned` (`FUN_002edba0` D:L190405-190487, the -972 at
D:L190430), which the console shows as MP_BANNED_FROM_GAME, UIMnLOC 443 / 444.

**The port.** The room now tells its owner which seat a passed team vote removes: `RoomOptions.onRemoved(seat)`,
called in `applyVotes` for each target as VOTE_KICK_POINT_READING's screen starts, before the seat leaves (so the
bridge still names its account) -- one hook beside `onRoundOver`, never a second path to the bridge, and not called for
VOTE ALL's eject (no BanSelfFromGame on that path, §4.2). The bridge's game rooms answer it with
`RoomService.banFromGame(game, accountOfSeat(seat))`, and the lobby's JoinGame refuses that account PlayerBanned (-972)
for that game -- its check stands before the password and the seats, as it did (`lobby.ts` `joinGame`). Another game
admits the account; a voter's own JoinGame is answered as before.

**"That game", and how long.** In the port "that game" is the game-list game -- its `mediusWorldId`, the id the bridge's
room is made for -- and the ban is held on that game's record, so it ends with the game (`endGame` drops the record;
a later game is a new record): `GAME_BAN_LIFE_PLACEHOLDER`, `'the game'`. How long the original's refusal lasted is not
read: MediusBanPlayer's 120 has no unit read (minutes believed, research 203 §4), Sony's server answered it, and no
capture holds a rejoin; the world outlives a match (research 179 §6.4), so the original's refusal may outlive the
match, as the port's does (the game's life spans its matches). **Horizon at the pin** has no answer to copy: it names
MediusBanPlayer (0x8A) and handles none (research 263 §5.3), and its JoinGame refuses only an account banned by name
and MAC in its database (desktop@be557831 `Server.Medius/Medius/MLS.cs:2845-2860`, the check
`Server.Database/DbController.cs:712-735`) -- a ban of every game, which no game's end clears and which outlives every
game, answered MediusFail with a ban message, not -972. The port's -972 per game follows the original's client.

**Beside it, unchanged:** the room's own refusal of the removed player's network address for 10 minutes
(`VOTE_BAN_MS`, `VOTE_BAN_SCOPE_PLACEHOLDER`, H170 (H-next d); research 263 §5.3, §6) -- the owner's call stands.

### 4.2 VOTE ALL, the spectators' eject (research 91 §17 1.1)

| rule | the original | the room | state |
|---|---|---|---|
| who votes | an online player, living or dead: "VOTE ALL ON:OFF" under the TCM's SPECTATORS (`FUN_00232bc0` D:L83632-83633, its handler `FUN_0022f0f0` and label `FUN_0022f210` bound at D:L83805); the spectator's TCM has RADIO only (D:L83641-83644); no life test on its path: SPECTATORS carries no enable (D:L83794), its row `FUN_0022f210` D:L81293-81313 (a spectator present), the handler `FUN_0022f0f0` D:L81263-81277; the send `FUN_0030cef0` untraced. `FUN_0022f810` (D:L81519-81527) enables for a living actor, else, online, for a spectator, and gates only the NODEACTION ROOT, TAUNTS and RADIO roots (D:L83757, D:L83774, D:L83787) *(2026-10-17, AD-10, research 227 §2.9)* | a seat in `players` (`voteAll`); a spectator's ignored, a dead player's counted | reading, pending review; the spectator's refusal and the dead player's count tested. Was: "the TCM gated as for the team vote (`FUN_0022f810` D:L81511-81526)", a seat "that is alive", a dead player's ignored: the misread |
| the toggle | the voter's toggle flipped (D:L81263); for each spectator present whose mark (its slot record's +0x49, `FUN_002c3980` D:L81269) differs, the mark set (`FUN_002c39d0` D:L81271) and one "Spec Vote" broadcast (`FUN_002b9b60` D:L159568) and applied locally (D:L159570); no spectator present, nothing sent (the entry shown only then, `FUN_0022f210` D:L81282-81310) | the page sends the state (`voteAll`, `on`); a line per spectator present whose mark differs; none with no spectator | reading (`VOTE_ALL_LINE_PER_SPECTATOR_READING`: the decompiler lost `FUN_002c39d0`'s value argument, read as the toggle; the instructions carry it -- in the disc's `socom2_game.elf` at 0x0022f198 the toggle's byte, DAT_00412ff8, is loaded into a1 for the mark's compare, and at 0x0022f1a4 `FUN_002c39d0` is called with no write to a1 between (a0, the spectator, set in the branch's delay slot), the setter storing its second argument at +0x49 (D:L165142-165155): a reading at the instruction level, not measured running) |
| who counts | every console: the voter's flag (+0x4a) set to the message's state (`FUN_002c2f50` D:L159589), every set flag counted (`FUN_002c2ef0` D:L164547-164574) | the room: the voters whose vote stands | a labelled server's part (OT.R27), as the team vote's count |
| the line | every console prints " %s voting against spectators: %d votes against." (S:0x3f25e0) or " %s voting for spectators: %d votes against." (S:0x3f2620) -- the voter's name, the votes standing -- in its message window (D:L159591-159597); **the leading space is the ELF's** (its bytes at 0x3f25e0 and 0x3f2620 open on 0x20; the team vote's S:0x3f26c0 does not) | `spectatorVote` {name, against, count} to every connection (`broadcast`), the page to format it with `spectatorVoteText` (`protocol.ts`, the two formats verbatim) -- the team vote's path: `votes` {count}, formatted by the page | reading; the page's drawing not built |
| the threshold | votes > 0.6 x (SEALs + Terrorists): `FUN_002c2e30` D:L164516-164544, the side counts recomputed first (`FUN_002c4500` D:L164526), which count no spectator (bit 0x10000, D:L165605-165665); 8 players: 5, not 4 | `VOTE_ALL_SHARE` x `players.size` < votes | reading; tested (8 -> 5 yes, 4 no, with 3 spectators present) |
| who decides, when | the host (`DAT_0045a0c0`), at every Spec Vote it receives or sends, a retraction's too (D:L159598) | the room, at every line -- a labelled adaptation: the server decides on the host's behalf, a game room's and a dedicated room's (which has no host) alike | adaptation (OT.R27) |
| the eject | the host broadcasts "Reject" (S:0x3f23b8, D:L159600); every console prints "Spectators EJECTED from this game." (S:0x3f2650; D:L159601, `FUN_002b9d80` D:L159625), sets MaxSpectatorsValve to 0 (D:L159602-159606, D:L159626-159630) and, a spectator, opens dlgNetBanned.rdr (D:L159607-159610, D:L159631-159634); the host's test has no guard, so each passing Spec Vote of one toggle ejects again | `spectatorsEjected` to every connection; each spectator `kicked` 'vote' and closed 4002 "YOU HAVE BEEN KICKED FROM THIS GAME", as a vote-removed player is (the page routes `kicked` 'vote' to #539's dlgNetBanned.rdr, `GAME_KICKED_DIALOG_READING`); no address ban, no `onRemoved`; repeated per line as the original's | reading; the page's screen is the page's (#539, not built here) |
| after it | MaxSpectatorsValve 0: the host refuses a spectator's join when the valve (8 when absent) is at most the spectators present (`FUN_002bc620` D:L161396-161422, reason 2), the joiner showing "Too many spectators" (S:0x3f24b0) through MP_EJECT_SPECTATOR (`FUN_002b9150` D:L159215, D:L159227; `FUN_002baf30` D:L160342, D:L160357); a player's join is not the valve's | `hello` refuses a join the room would seat as a spectator, `refused` `TOO_MANY_SPECTATORS`, for the room's life; a player's seat still admitted. The order (the review's F1, below the table) | reading; tested |
| the game list | the host's GameStats byte 4 is the valve (`FUN_002f7c40` D:L196730-196731): its next world report would list 0 spectator slots | the bridge's report keeps the created slots; a watcher's JoinGame admitted, its hello refused by the room | placeholder (`VOTE_ALL_LISTED_SLOTS_PLACEHOLDER`) |
| no expiry | a standing flag until retracted or its voter leaves (the slot record freed, `FUN_002c5750` D:L166323-166324) | `drop` clears the voter's vote and its marks, and the marks on a leaving spectator | reading; tested (the leaver's vote no longer counted) |

**The refusal's order (the review's F1).** The refusal was first decided after the hello's `join` / `replace`, so a
seated player's same-session hello that watched was `replace`d -- its older connection released, dropped and closed,
its lobby seat left -- and then refused without the replacement's `left` going out (the others kept a ghost of the
seat, the score / recorder refresh and the abandon / countdown reconciliation of `broadcastChanges` skipped, and the old
socket's close no longer the seat's). Now, in `hello`: (a) a hello with `watch` that is no takeover is refused
`TOO_MANY_SPECTATORS` **before** the join or the replacement, its outcome known ahead -- nothing is released, the
session's older seat stays seated and connected, and no change is told; (b) the one hello the refusal can decide only
after the join, a playing hello the lobby queues as a spectator (the players full, the server's queue, W3.R11), leaves
its own temporary place and publishes the rest of the join's changes (`broadcastChanges`, the joiner's own excluded)
before the refusal -- a fresh join has none; a replacement's would carry the older seat's `left` and a promotion, though
after the eject no watcher remains for a playing hello to replace (each was ejected, and a new one is refused by (a)),
so that branch guards an order no test can reach and none is claimed. **What the original does here is not read as a
case**: its join refusal is the host's answer to a client's join request (`FUN_002bc620` D:L161396-161422, reason 2),
and a console seated as a player holds one client slot -- it has no second connection that could re-enter as a
spectator while its seat stands (the session takeover is the port's, S2 round 4); to watch, it would leave its seat
first (its departure handled as any other, `FUN_002bc530` D:L161109-161146, research 315 §3.3) and then ask, and be refused. Keeping the seat on a refused
watching hello is the conservative choice, named here as such: the departure the original would show is the player's
own leave, which the port's page still makes by closing its seat's connection.

### 4.3 The protocol, and what is the page's

Additive under protocol 11 (COLLABORATION, "A protocol change"; `protocol.ts` a hot file, claimed in HANDOFF §3): the
client's `{ type: 'voteAll'; on }`, the server's `{ type: 'spectatorVote'; name; against; count }` and
`{ type: 'spectatorsEjected' }`; an older page ignores both events, an older room the client's. The replay fold
classifies both new events transient (`fold.ts`'s `EVENT_CLASS`, whose type requires every kind). **Not built, the
page's** (ONL-22's screens and the round's TCM): the SPECTATORS entry "VOTE ALL ON:OFF" and its two labels (S:0x3e5cc0
/ S:0x3e5cb0), the two lines and "EJECTED" in the message window (`spectatorVoteText`, `SPECTATORS_EJECTED_TEXT`), the
ejected spectator's #539 (already routed by `kicked` 'vote'), the "Too many spectators" refusal's MP_EJECT_SPECTATOR
dialog, and the -972's UIMnLOC 443 / 444 on the game list's join (the page's JoinGame reader). *(2026-10-11, SVC-23f:
built, §4.5 -- the two lines' wiring in `netPage.ts` too, in the review's fix round; the -972's 443 / 444 were already
built and tested at ONL-16a's join, §4.5. Reading, reviewed 2026-10-11 by a fresh reviewer -- PASS WITH FINDINGS (high), the findings fixed; the fix round re-read PASS WITH FINDINGS (high), two lows, both answered at the merge 54f7d5597 *[corrected at the merge: this line first claimed the fix round's review before it ran]*.)*

### 4.4 The tests, and the runs

`packages/central/test/room.test.ts`, the kicks' block (eight): the hook told the removed seat once, at GAME COMPLETE's
start and not before, the seat still the room's; VOTE ALL's threshold (8 players: 4 no, 5 yes; three spectators present
and not counted; three "EJECTED" from the passing toggle's three lines; no `onRemoved`); a line per spectator to every
connection with the leading space, the same state again sending nothing, the retraction; a spectator's and a dead
player's toggle refused and nothing sent with no spectator present; a voter's leave clearing its vote (four of seven not
passing); the eject's line, `kicked` and close, the later spectator refused `TOO_MANY_SPECTATORS` (the ejected one
too), a player still seated; and two of the review's F1 (§4.2, the refusal's order): after the eject a seated player's same-session hello that watches refused `TOO_MANY_SPECTATORS` with nothing replaced -- the older connection not `kicked` nor closed, its seat and its lobby place kept, no event to the others -- and the same session's playing hello still a takeover; a playing hello queued by a full room refused, nothing told. `packages/central/test/bridge.test.ts` (one, over real sockets and HTTP): four accounts,
three SEALs; two vote the third out; the round ended by hand (the lone Terrorist down, the room stepped to ROUND
COMPLETE's start); the removed account's JoinGame to that game -972, to another game Success, a voter's unchanged; the
game ended, the same JoinGame GameNotFound.

The runs (unit tests; `npx vitest run --maxWorkers=1`, one file per call, free memory read before each, 2026-10-10):
**RED** -- `room.test.ts` on the base's `room.ts` with the six tests: 6 failed, 173 passed (the hook never told; the
names undefined; no line, no eject); `bridge.test.ts` with its test: 1 failed, 23 passed (the voted-out account's
JoinGame answered 0, not -972: the kick ran, no ban). **GREEN** -- `room.test.ts` whole, 179 of 179; `bridge.test.ts`
24 of 24; `lobby.test.ts` 65 of 65; `round.parity.test.ts` 19 of 19; the viewer's `replayFold.test.ts` 3 of 3 (the
union's kinds, the two new ones classified); `resultsNegative.test.ts` 8 of 8 (MP72 present; its sweep of every
client message now samples `voteAll`, which moves no record); `placeholderLedger.test.ts` 13 of 13; `roundLedger.test.ts` 4 of 4;
`docs.test.ts` 16 of 16; `desktopCitations.test.ts` 10 passed, 1 skipped (its check of the cited paths at the pin needs
the `ref/desktop` submodule, absent in this worktree; the two Horizon cites re-read at the pin by `git show`). No
typecheck run (the seat's, at the merge); the bridge test's second game is named apart (`hostGame`'s new optional name,
the list refusing a second 'test$~Alpha').

The review's F1 (2026-10-10; unit tests, the same conditions): **RED** -- `room.test.ts` with the two tests on
`49c219f4c`'s `room.ts`: 1 failed, 180 passed (the older connection `kicked` 'replaced'; the queued playing hello's
test passes on the base, the refusal already after the join there, and pins (b)). **GREEN** -- `room.test.ts` 181 of
181; `bridge.test.ts` 24 of 24; `round.parity.test.ts` 19 of 19; `docs.test.ts` 16 of 16. No typecheck run.

### 4.5 The page's half (SVC-23f)

*Added 2026-10-11 (web sprint 18, wave 1; W18.R3; the brief `../plans/briefs/2026-10-11-s18-w1-svc-23f-vote-all-page.md`).
**Reading, reviewed** (at its merge, 54f7d5597): transcribed from the retail decompilation (`FUN_<addr>`, `D:L<n>`), the ELF's strings
read at their addresses in the disc's `socom2_game.elf`, and the disc's dialogs through `tools/dump-dialogs.ts`;
nothing measured running.* Code: `packages/viewer/src/spectatorVote.ts` (new), `tauntMenu.ts` / `tauntLayout.ts`
(the sixth root), `matchTaunts.ts` (the state's `roots`), `matchChat.ts` (its rows), `gameLobbyHost.ts` (the refusal's reason handed on),
`packages/ui/src/screens/gameLobbyCommands.ts` (`seatEnded`'s MP_EJECT_SPECTATOR).

**The TCM's SPECTATORS.** The round's command menu existed (TAUNTS, research 301; TACTICAL ORDERS, RADIO, TEAMMATES,
MESSAGES, research 302 and note 227) with five roots; the original's player tree has six. `FUN_00232bc0` builds them in
the order TACTICAL ORDERS (S:0x3e5ef0), TAUNTS (S:0x3e6090), RADIO (S:0x3e5dd0), TEAMMATES (S:0x3e6240), **SPECTATORS**
(S:0x3e63e0, help "Spectator controls" S:0x3e63f0) and MESSAGES (S:0x3e6448) (D:L83586-83634), SPECTATORS' one row
"VOTE ALL ON:OFF" (S:0x3e6410, help "Vote to Retain or Remove all players" S:0x3e6420, D:L83632-83633); a spectator's
tree holds RADIO alone (D:L83641-83644). `FUN_002344e0` binds the root to nothing (D:L83794) and the row to the handler
`FUN_0022f0f0` and the label-and-enable `FUN_0022f210` (D:L83805). `FUN_0022f210` (D:L81282-81310): no spectator
present, it returns 1; else it sets the label -- "VOTE ALL REMOVE" (S:0x3e5cc0) with the toggle `DAT_00412ff8` off,
"VOTE ALL RETAIN" (S:0x3e5cb0) with it on -- and returns 0. The return is the node's disabled byte +0x738
(`FUN_00231a30` D:L82546-82554); a parent whose children are all disabled is disabled (D:L82568-82582) and a disabled
node is not drawn (`FUN_00230870` D:L82151) -- so **SPECTATORS is drawn only while a spectator is present**, in its place
between TEAMMATES and MESSAGES. The page: the root id 5 (`SPECTATORS_ROOT`; the others keep 0-4), drawn in the tree's
order (`ROOT_ORDER`) while its rows are there; its row's label from the toggle (`VoteAllToggle`), its press flipping the
toggle (D:L81263) and sending `voteAll { on }` with the new state (the room sends the per-spectator lines,
`VOTE_ALL_LINE_PER_SPECTATOR_READING`); the spectators known by name from the room's `score` (`Hud.spectatorCount`).
The toggle is cleared with the TCM (`FUN_0022f3b0` D:L81349, from `FUN_001fbae0` D:L57781): here at the part's
`dispose` (the match's end) and for another ~~client id (a new seat; the room's `drop` clears the old seat's vote)~~
*(2026-10-11, the review's F2: `/testroom`'s page mounts the part once and never disposes it, and the server reuses a
seat id across matches, so a toggle keyed by the id carried over)* net client -- the toggle is keyed on the client
object, so the next match's connection starts off as the original's teardown leaves it (D:L57780-57781).
~~**Not as the original, named**: what the menu does when the node it is on becomes disabled under it (the spectators
gone while SPECTATORS is selected or open; `FUN_00231690`'s `FUN_00232890` / `FUN_00235300` at D:L82467-82469, not read) --
`SPECTATORS_LOST_RETURN_READING`, the page back at the roots with the next drawn root selected.~~ *(2026-10-11, the
review's F1: read at the cited lines, and the constant was a guess filed as a reading -- retired.)* **The spectators
gone while SPECTATORS is selected or open: the TCM closes.** `FUN_00231690`'s open state (case 1) finds the node it is
on disabled and calls `FUN_00232890(+0xdb8, 0)` then `FUN_00235300(.., 0)` (D:L82467-82469) -- the pair the input
handler closes the menu with for Triangle at the top (D:L84334-84336; `FUN_00235300` alone for a null or disabled
current node, D:L84323-84328); `FUN_00235300` with 0 sets +0x750 to 3, the closing state (D:L83949-83954). The page
closes it as its Triangle at the top does, the reopening held off `CHAT_HOLD_SECONDS` (`tauntMenu.ts` `settle`). **Findings, not this
task**: the original hides every disabled row, so TACTICAL ORDERS' rows a game type refuses (`FUN_0022fa90`) are not
drawn there, where the page draws them inert (research 302 §3's `unsupported`); the menu's columns are taken when a
branch opens, where the original re-runs the enable functions (`FUN_00231a30`).

**The lines.** Every console prints the Spec Vote's line (D:L159591-159597) and the eject's "Spectators EJECTED from
this game." (S:0x3f2650; D:L159601; `FUN_002b9d80` D:L159625) through `FUN_002b6530` into the message window
(0x4366a0), scale 0 (the window's own, `MESSAGE_SCALE`) and **colour 2**: `FUN_002b6530` reads a row of four floats from
0x440c70 by the colour index (D:L157995-157999), filled by `FUN_002b7530` -- row 2 = (64, 64, 96, 100) (D:L158322,
D:L158329-158331; rows 3 and 5 agree with research 302's (64, 128, 64, 100) and research 301's (128, 64, 64, 100)).
`FUN_002b6530` starts its text past the leading spaces (D:L157930, the drawn text from there, D:L157992), so the
formats' leading space (the ELF's, kept in `SPECTATOR_VOTE_FORMATS`) is not drawn. `spectatorVoteLine(ev)` gives the
line for either event, once per event. ~~**Not wired**: the two events reach the page in `NetPage`'s event switch
(`netPage.ts`, a hot file this task does not touch); the seat's one line there is
`case 'spectatorVote': case 'spectatorsEjected': hud.postMessage(spectatorVoteLine(ev)); break;`. (The team vote's
own line, `votes`, is drawn there in the default colour with its leading space; the original's `FUN_002b6530` call at
D:L159766 is colour 2 too -- a finding for that line's owner.)~~ *(2026-10-11, the review's fix round: `netPage.ts`
granted, claimed in HANDOFF §3 on `agent/online`.)* `NetPage`'s event switch posts both (`spectatorVoteLine`), and the
team vote's own line too, which it drew in the default colour with a leading space of its own: the original's is
"Voting: You have %d votes against you." (S:0x3f26c0, no leading space) through the same `FUN_002b6530` call, colour 2
(`FUN_002ba040` D:L159765-159766) -- `teamVoteLine`, the same line builder.

**The dialogs.** The host's join answer's readers (`FUN_002b9150` D:L159215, D:L159227; `FUN_002baf30` D:L160342,
D:L160357) format reason 2 as "Too many spectators" (S:0x3f24b0, "%s" S:0x3f2478) and post it with the event
MP_EJECT_SPECTATOR (S:0x3f2530) through `DAT_0044f3c8` (= `FUN_0027e610`, D:L122664: the current dialog's event). The
disc's handlers (`tools/dump-dialogs.ts --dialog`): `dlgMPBriefingRoom.rdr`'s `spectator_rejected` --
DisconnectFromGameServer, POPUPDIALOG (the event's text: "Too many spectators" over CONTINUE, as the page's popup draws it) with #527 ("PLAYER REJECTED") on JoiningAnim, SWITCHMENU(dlgMPBriefingRoom.rdr) once the popup closes, halt_join; `dlgGameLobby.rdr`'s own --
DisconnectFromGameServer, POPUPDIALOG, KillPopup, ReturnToBriefingRoom. The room's refusal after the eject is the hello's
`refused` with `TOO_MANY_SPECTATORS` ('Too many spectators', server `room.ts`), closed 4000: the game socket
(`GameSocketHost`) now keeps the `refused` reason and hands it to the seat's end (`seatEnded(code, refusal)`), which
posts MP_EJECT_SPECTATOR with that text (`TOO_MANY_SPECTATORS_TEXT`, the room's own string, a test holding the two
equal), whichever dialog holds the join. The other host reasons (0, 1, 3, 4, 5) post the same event in the original;
the room's other refusals are not mapped to them here (a finding: "The game is full." is the original's reason 3,
"Too many players", S:0x3f24d0). **The -972** was already the page's: JoinGame's reply posts MP_BANNED_FROM_GAME
(`gameLobbyCommands.ts` `joinGame`, `FUN_002edba0` D:L190430), whose `banned_from_game` pops #443 and writes #444
(`dlgMPBriefingRoom.rdr`; `tools/dump-dialogs.ts`: "POPUPDIALOG(NA) calls halt_join, OnBriefingRoomstart locs
443,444"), tested since ONL-16a (`gameLobbyScreen.test.ts`, "the join's refusals as the room shows them").

**The listed slots** (`VOTE_ALL_LISTED_SLOTS_PLACEHOLDER`, kept; §6). Read: the host's world report (`FUN_002ef590`)
puts MaxPlayers = MaxPlayersValve + MaxSpectatorsValve (D:L191354-191363) and GameStats from `FUN_002f7c40`, byte 4 the
valve (D:L196730-196731); it returns its next period, 25 000 ms, 5 000 ms on one branch (D:L191349, D:L191385-191392,
D:L191410; the branch's `DAT_004364fc` not read). The list's row (`FUN_002e2ce0` D:L184418-184437, the page's
`gameListRow`) draws MAX as MaxPlayers less byte 4 and SPEC MAX as byte 4, SPEC capped by it -- so after the eject's
next report the list would show the players' IN / MAX unchanged and SPEC 0 / 0. The two other callers
(`FUN_00303780` D:L204009, `FUN_00303f40` D:L204367) fill a game record at 0x44feac (to `FUN_002f3ef0`), not traced.
Not built: the port's report is the bridge's (`bridge.ts` `report`, the server's, not `lobby.ts`), and building it
needs what is unread -- when after the eject the host's next report goes, and whether the lobby server then refuses
a watcher's JoinGame by the listed slots (the room refuses its hello today) -- ONL-32's transcript.

### 4.6 The tests, and the runs (SVC-23f)

The tests: `packages/viewer/test/spectatorVote.test.ts` (new: the root's order and texts, the row only with a
spectator, the press's two states and labels, the toggle's reset and seat; the two lines' exact strings, colour 2, no
leading space); `tauntMenu.test.ts` (SPECTATORS drawn only with rows, in the tree's place; the walk of the six roots;
~~`SPECTATORS_LOST_RETURN_READING`~~ the TCM closed when the last spectator goes, its reopening held off); `tauntLayout.test.ts` (the drawn roots and the help); `matchChat.test.ts` (the root
absent with no spectator, VOTE ALL's two sends through the menu, a spectator offered none, `dispose`);
`gameLobbyHost.test.ts` (the refusal's reason handed on; the room's `TOO_MANY_SPECTATORS` equal to the page's);
`packages/ui/test/screens/gameLobbyScreen.test.ts` (a watcher's refused hello: MP_EJECT_SPECTATOR's
`spectator_rejected`, the socket closed, the reason in the popup, #527 on JoiningAnim, state 11, the briefing room after CONTINUE). The runs (unit tests and one dev-disc test; `vitest run --maxWorkers=1`, one file per call, free memory read before each, 2026-10-11): **RED** on the base's sources with the new tests -- `spectatorVote.test.ts` failed to load (no module); `tauntMenu.test.ts` 3 failed, 8 passed; `tauntLayout.test.ts` 1 failed, 1 passed; `matchChat.test.ts` 3 failed, 10 passed; `gameLobbyHost.test.ts` 2 failed, 15 passed; `gameLobbyScreen.test.ts` (with `SOCOM_DISC`) 1 failed, 29 passed. **GREEN** -- `spectatorVote.test.ts` 6 of 6; `tauntMenu.test.ts` 11 of 11; `tauntLayout.test.ts` 2 of 2; `matchChat.test.ts` 13 of 13; `gameLobbyHost.test.ts` 17 of 17; `gameLobbyScreen.test.ts` 30 of 30 (with `SOCOM_DISC`); `matchTaunts.test.ts` 11 of 11; `talkInput.test.ts` 23 of 23; `controllerPulse.test.ts` 10 of 10; `placeholderLedger.test.ts` 13 of 13; `docs.test.ts` 16 of 16. No typecheck run (the seat's, at the merge); no browser run.

The review's fix round (2026-10-11; reviewed PASS WITH FINDINGS -- F1 the close, F2 the toggle's key -- and the wiring
granted; the same conditions): the tests first -- `netPageVoteLines.test.ts` (new: the three lines through `NetPage`'s
event switch from a fake socket), `spectatorVote.test.ts` (a new client with the same seat id starts off; the team vote's
line), `tauntMenu.test.ts` (the TCM closed at depth 0 and 1). **RED** -- `netPageVoteLines.test.ts` 2 failed (no line posted for the two events; the team vote's in the default colour with its leading space); `spectatorVote.test.ts` 2 failed, 5 passed (the toggle carried to a new client of the same seat id; no `teamVoteLine`); `tauntMenu.test.ts` 1 failed, 10 passed (the menu still open). **GREEN** -- `netPageVoteLines.test.ts` 2 of 2; `spectatorVote.test.ts` 7 of 7; `tauntMenu.test.ts` 11 of 11; `tauntLayout.test.ts` 2 of 2; `matchChat.test.ts` 13 of 13; `matchTaunts.test.ts` 11 of 11; `gameLobbyHost.test.ts` 17 of 17; `gameLobbyScreen.test.ts` 30 of 30 (with `SOCOM_DISC`); `netPageRound.test.ts` 18 of 18; `placeholderLedger.test.ts` 13 of 13; `docs.test.ts` 16 of 16. No typecheck, no browser.

## 5. The round's signals, flags and bounds (SVC-23b)

*Withheld from the public edition:* this section describes the private server's cheat signals, its flags and their thresholds. The names stay listed in section 6 so the placeholder ledger holds them; their values are the server operator's.

## 6. Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `JOIN_IN_PROGRESS_MARK_READING` (server `stats/roomResults.ts`; `room.ts` `seat`) | `'seated after its match began'`: classic, after its first round started; respawn, a tick after the match's start, a respawn room's first match beginning with its first seat (its first seats not in progress); kept by a takeover, cleared by a new match | the calculator's halving mark: the player state's +0x43 not -1 (`FUN_002c2dc0` D:L164486-164513, D:L76756), set at the join from game +0xcd (`FUN_002c06a0` D:L163205-163210), +0xcd from +0xcc as the client connects (`FUN_001f5e70` D:L55715-55717); +0xcc's setter (D:L149278) and its callers unread | a two-console run with a join in round 2: the joiner's per-round posts halved (ONL-32); a read of +0xcc's callers | open |
| `SEAT_PLAYED_MS_READING` (server `stats/roomResults.ts`; `room.ts` `endRound`) | `'from the round's start or the seat's seating, to the round's end'`, summed over the match, in ms | the console's own game +0xf0, zeroed at its game's creation (`FUN_002ad290` D:L152597) and added each round's +0xe8 (`FUN_002a9b30` D:L150666-150669): whether a joiner's first +0xe8 runs from the round's start or from its join is unread; with `MATCH_CLOCK_TOTAL_READING`'s own open stop | a joiner's TOTAL PLAYING TIME read back after a match (PLAT-36's PEEK); ONL-32's post | open |
| `SEAT_ROUNDS_READING` (server `stats/roomResults.ts`; `room.ts` `endRound`) | `'the rounds the seat played, not as a ghost, by the round's winner'` | research 155 §4.2's rounds won, lost and drawn a seat: the original's fold reads the sides' wins instead (game +0x120 / +0x124, `FUN_00225070` D:L76650-76651), which the results carry too; no single source counts a seat's own | SVC-07's use of them (the fold reads the sides' wins); the owner, if a seat's own count is ever shown | open |
| `LADDER_PASSWORD_GAMES_PLACEHOLDER` (server `stats/results.ts`) | `'counted'`: a game with a player password counts as any other | H86 call 2 (research 155 §4.5, §6; the sprint's H-next a): the original counts every online game with respawn off (R155.3; nothing in the upload rule reads the game's security, D:L76080-76081, D:L75798); research 155 recommends public games only; `'not counted'` is the queue's one branch (`notCounted`) | the owner's answer to H86 call 2 | open |
| `SEAT_RATING_TOLD_PLACEHOLDER` (server `stats/results.ts`) | `'computed and logged; no event carries it to the seats yet'` | each seat's new rating and medal after a round, which the original's in-game player state carries (+8 the published rating, `FUN_002c5360` D:L166208-166209; +0x42 the medal, research 155 §2.3, §4.4): computed (`SeatTold`) and handed to `tell` (a log line in `createServices`), sent to no page | SEAT-TOLD (§7, proposed): the room's server event through the bridge, filling the page's player state; ONL-32's transcript for what each console publishes between rounds (`RATING_PUBLISHED_REFRESH_READING`) | replaced 2026-10-11 by `SEAT_TOLD_BETWEEN_ROUNDS_READING` (SVC-07c: the event built) |
| `SEAT_TOLD_BETWEEN_ROUNDS_READING` (server `stats/results.ts`; `bridge.ts` `seatsTold`, `room.ts` `tellRatings`) | `'at each counted round applied and at each join: one seatTold to every socket of the game'` | the original's carriage of each seat's new rating and medal between rounds: its player state's +8 and +0x42 set from the record and the ladder (`FUN_002c5360` D:L166200-166201 the medal, D:L166208-166209 the rating; the `oop9` name's forced 4, D:L166202-166205, `publishedMedal`), but which message each console publishes that state in, and when after the round's post, unread (SVC-07c's Unknowns: the lobby's refresh or the game session's); here the server tells every socket of the game at once after the round is applied, the values the queue's (§2) | ONL-32's transcript of what each console publishes between rounds (research 261 §8.5's published rating, `RATING_PUBLISHED_REFRESH_READING`) | reading |
| `OOP9_MEDAL_NAME_READING` (server `ladder.ts` `publishedMedal`; `bridge.ts` `seatsTold`) | `'the account name, whole and case-sensitive'` | the name the original compares with `oop9` (S:0x3f2a88, the disc's `socom2_game.elf` bytes) before forcing the published medal to 4 (`FUN_002c5360` D:L166202-166205): the player state's +0xe, whose writer is not re-traced here (research 155 §2.3 reads it as the player's name); the compare itself is read -- `FUN_00198f18`, a strcmp (D:L15847-15859: whole, case kept) | a read of +0xe's writer; ONL-32's transcript of a player state | reading |
| `SEAT_TOLD_PLAYERS_ONLY_READING` (server `stats/results.ts`; `bridge.ts` `tellSeats`) | `'the players of the room, never a watcher'` | whether the original publishes a player state (+8, +0x42) for a spectator's console: `FUN_002c5360` reads the console's own slot record (D:L166194-166196) with no role test there, and what the other consoles hold for a spectator is unread; here a `seatTold` names the room lobby's players only -- the pages know a watcher by name only (`score.spectators`), never by an id -- and every socket, a watcher's too, hears it (SVC-07c's re-review A) | ONL-32's transcript of a game with a spectator | reading |
| `RESULT_BOUNDS_ADAPTATION` (server `stats/results.ts`) | `'two seats, kills above the opposing seats, a classic round under 15 s: dead-lettered'` (`RESULT_ROUND_MIN_MS` 15 000) | no original: the console trusted its own result; the services' bounds on their own room's result (research 169 §4.2), a server's check | nothing to settle: a labelled adaptation; SVC-23b's measured bounds may refine it | adaptation |
| `LEAVE_COST_PLACEHOLDER` (server `stats/roomResults.ts`) | `'none'`: a seat gone before its round's end is in no result of that round | H86 call 7 (research 155 §4.3, §6; the plan's H-next b): the original's leaver is in no calculator (its console never reaches the round's end; its actor ghosted on the others, `FUN_002bef60` D:L162534); option (b), `'counted'`, is `roundResultOf`'s one branch | the owner's answer to H86 call 7 | replaced 2026-10-10 by `LEAVE_COST_OWNER` (the call already ruled, OT.R33 call 7 (b)) |
| `VOID_AUTHORITY_PLACEHOLDER` (server `stats/void.ts`; `cli/voidMatch.ts`) | `'the operator with the data directory, by the CLI over the ledger: no page, no bearer, no automatic void'` | who may void a match and on what evidence (H86 call 12; the plan's H-next c, H-next f): the original has no void; research 155 recommends the owner and the moderators he names on the ledger's evidence and a named report, a role not built; the default -- the operator, a free-text evidence note in the void's line, a flag never a void by itself (research 169 §5), no recomputation (§3.4) | the owner's answer to H-next c | open |
| `LEAVE_COST_OWNER` (server `stats/roomResults.ts`; `room.ts` `noteLeaver`, `matchSeats`) | `'the match kept'`: a leaver's seat in the `MatchResult` as it stood when it left, folded at the end; in no calculator of its round or a later one | OT.R33 call 7 (b) (`plans/2026-10-02-online-path-target.md`:357-361): "a player who quits keeps the match and its history, scored as it stood when he left and folded into the record when the server writes the match at its end -- no extra penalty"; the original's leaver folds nothing (`FUN_00223970` D:L76078-76082) | nothing to settle: the owner's rule | the owner's rule (OT.R33 call 7) |
| `FLAG_HIT_SHARE_PLACEHOLDER` | (withheld: a threshold of the private server's operator) | | |
| `FLAG_HEAD_SHARE_PLACEHOLDER` | (withheld: a threshold of the private server's operator) | | |
| `FLAG_MIN_SAMPLE_PLACEHOLDER` | (withheld: a threshold of the private server's operator) | | |
| `FLAG_OUTLIER_SIGMAS_PLACEHOLDER` | (withheld: a threshold of the private server's operator) | | |
| `FLAG_POPULATION_MIN_PLACEHOLDER` | (withheld: a threshold of the private server's operator) | | |
| `FLAG_REFUSED_PLACEHOLDER` | (withheld: a threshold of the private server's operator) | | |
| `FLAG_BURST_COMMANDS_PLACEHOLDER` | (withheld: a threshold of the private server's operator) | | |
| `FLAG_BURST_REPEATS_PLACEHOLDER` | (withheld: a threshold of the private server's operator) | | |
| `FLAG_ROOM_STALL_COMMANDS_PLACEHOLDER` | (withheld: a threshold of the private server's operator) | | |
| `FLAG_ROOM_STALL_SHARE_PLACEHOLDER` | (withheld: a threshold of the private server's operator) | | |
| `FLAG_ROOM_STALL_MIN_SEATS_PLACEHOLDER` | (withheld: a threshold of the private server's operator) | | |
| `FLAG_MEETINGS_PLACEHOLDER` | (withheld: a threshold of the private server's operator) | | |
| `FLAG_RATING_RISE_PLACEHOLDER` | (withheld: a threshold of the private server's operator) | | |
| `FLAG_WINDOW_MS_PLACEHOLDER` | (withheld: a threshold of the private server's operator) | | |
| `SHOT_CENTRING_MIN_ROUNDS_PLACEHOLDER` | (withheld: a threshold of the private server's operator) | | |
| `SHOT_CENTRING_FLAG_MEAN_PLACEHOLDER` | (withheld: a threshold of the private server's operator) | | |
| `GAME_BAN_LIFE_PLACEHOLDER` (server `lobby.ts` `banFromGame`; called by `bridge.ts`'s `onRemoved`) | `'the game'`: the -972 held on the game-list game's record, gone at `endGame` | how long the original refuses a vote-removed account that game: its own MediusBanPlayer names its account, the game's world and 120 of an unread unit (`FUN_002f95f0` D:L197800-197804), answered by Sony's server, unobserved; the world outlives a match (research 179 §6.4); our Horizon handles no MediusBanPlayer and refuses at JoinGame only an account banned by name and MAC in its database, every game, MediusFail (desktop@be557831 `MLS.cs:2845-2860`, `DbController.cs:712-735`) (§4.1) | ONL-32's transcript of a removed player's rejoin, later in the game and after it; the recomp's vote run (the 120's unit) | open |
| `VOTE_ALL_LINE_PER_SPECTATOR_READING` (server `room.ts` `voteAll`) | `'a Spec Vote per spectator whose mark differs'` | what one VOTE ALL toggle sends: a Spec Vote per spectator present whose +0x49 mark differs (`FUN_0022f0f0` D:L81263-81273), each a line on every console and a test of the host's (`FUN_002b9bd0` D:L159587-159610) -- k spectators, k lines, and a passing toggle k ejects; `FUN_002c39d0`'s value argument lost by the decompiler, read as the toggle (§4.2) | the recomp's vote run with two spectators present: the lines and the "EJECTED"s each console prints for one toggle | reading |
| `SPECTATORS_LOST_RETURN_READING` (viewer `tauntMenu.ts` `settle`) | `'back to the roots, the next drawn root selected'` | what the original's TCM does when the node it is on becomes disabled under it -- SPECTATORS once no spectator is present (`FUN_00231a30` D:L82568-82582): `FUN_00231690`'s `FUN_00232890` / `FUN_00235300` at D:L82467-82469 (§4.5) | read at those lines by the review (F1): the TCM's plain close (the pair Triangle at the top closes with, D:L84334-84336; +0x750 to 3, D:L83949-83954) | retired 2026-10-11 (a guess filed as a reading; the page now closes the TCM, `settle`) |
| `VOTE_ALL_LISTED_SLOTS_PLACEHOLDER` (server `bridge.ts` `report`) | `'the created slots kept'`: GameStats byte 4 as the host made it, after the eject too | the original's host's GameStats byte 4 is MaxSpectatorsValve (`FUN_002f7c40` D:L196730-196731), which the eject sets to 0 (`FUN_002b9bd0` D:L159602-159606), so its next world report lists 0 slots; when it sends one (`FUN_002f7c40`'s callers, D:L191365, D:L204009, D:L204367) and what the list's IN MAX shows then are unread (§4.2) *2026-10-11, SVC-23f (§4.5): read -- the report (`FUN_002ef590`) sends MaxPlayers = the two valves' sum (D:L191354-191363) every 25 s (5 s on an unread branch, D:L191349, D:L191392), so the list (`FUN_002e2ce0` D:L184418-184437) would show IN / MAX unchanged and SPEC 0 / 0 after the next one; still unread: the next report's time after the eject and whether the lobby server then refuses a watcher's JoinGame by the slots; not built (the bridge's report)* | ONL-32's transcript of a game's world reports across a VOTE ALL eject | open |

## 7. What is left

- ~~**SVC-07** (the services' half, research 155 §4.2-§4.4): the queue's consumer -- the journal, the per-account mark,
  one store change a result (the fold, `applyMatch`, from the `RoomMatchResult`; the rating, `ratingsAfterRound`
  through `withRatings`, from each non-respawn `RoomRoundResult`; the last audit entry); SVC-12c's writer retired
  behind it in the same task (W22.R2), its tests moved, and with it the store commit that still runs inside the room's
  hook at the game over (§1.4). OT.R33's `countsForLadder` and the ladder's guards are its and SVC-23a's (W22.R3).~~
  *(2026-10-10, SVC-07: built, §2; reading, reviewed 2026-10-10 -- PASS WITH FINDINGS, fixed; the server package's
  typecheck exit 0 at the merge, cfec28011.)* Left from it: the seats told (SEAT-TOLD, below); the board's entry
  (SVC-23a, below; *built, §3.2*); the ledger's retention (SVC-04).
- ~~**SEAT-TOLD (proposed; a new row for the merge controller, Size S)**: each seat's new rating and medal after a round
  (`SEAT_RATING_TOLD_PLACEHOLDER`) sent by the room's server event through the bridge -- the queue's `tell` to the
  game's seats' sockets, a protocol field (`protocol.ts`, a hot file) -- and the page's in-game player state (+8, +0x42)
  filled from it; not ONL-16 (its chat half only, W22.R5) nor the lobby's player list (SVC-06's path serves the lobby,
  not the game's seats).~~ *(2026-10-11, SVC-07c: built, §2 "The seats told" -- the `seatTold` event and the page's
  `SeatToldBoard`, held by the page's `NetClient` as `told`; the placeholder replaced by
  `SEAT_TOLD_BETWEEN_ROUNDS_READING`. Reading, reviewed. Left from it: ~~the medals drawn (ONL-34)~~ *(drawn by ONL-34,
  e01267af6)*; ~~a joiner told
  the last pair at its welcome, if ONL-32 shows the original refreshes it then~~ *(built in the review's fix round,
  2026-10-11: every seated account's pair at each join, §2)*.)*
- ~~**SVC-23a's brief, a named follow-up -- the board's entry** (§2.7's finding, `LADDER_ENTRY_PLACEHOLDER`): a one-way
  "rated once as a non-ghost" flag on the account, set by the queue when a round's result rates it (a calculator's
  result above 0), the board reading it instead of "a written `'E'` record" -- exact per OT.R33 call 5 (b), where
  `lastResult` alone would seat a ghost of a round or a seat with a fold only; `resultsNegative.test.ts`'s `it.fails` case
  is the guard (it turns red when the fix lands: drop the `.fails`).~~ *(2026-10-10, SVC-23a: built, §3.2 --
  `ratedOnce`, `LADDER_ENTRY_OWNER`; the case a passing assertion. Reading, reviewed 2026-10-10 with SVC-23a, below.)*
- **SVC-23a** (2026-10-10; §3; reviewed 2026-10-10 by a fresh reviewer: FAIL -- the two-void order, §3.3, fixed in the
  same task; the fix re-reviewed PASS WITH FINDINGS; the server package's typecheck exit 0 at the merge): built -- the
  limits' ledger lines, the
  board's entry, the void and its CLI. Left from it: **H-next c** (`VOID_AUTHORITY_PLACEHOLDER`, the owner's); the
  account ban that gives `bannedAccounts` a writer (SVC-23's, `LADDER_BANNED_SOURCE_PLACEHOLDER`); the same-address
  note (§3.1: SVC-23b's, with the signals; *still owed, §5.1: the results carry no address*); the void's CLI in the
  image (`deploy/README.md` builds it beside the bundle; the Dockerfile is unchanged); ~~**the ledger's counter after a
  restore** (the re-review's low, from SVC-07's restore: the queue's counter restarts from the stored marks, so after a
  restore the ledger can hold two lines at one counter -- a line of an abandoned history at or below an account's mark
  would set its flag at a later migration, and `readLedger` drops a newer line with the same account and counter as a
  duplicate; owed: the counter started above the ledger's highest, with a test -- SVC-23b's or the close's)~~ *(2026-10-10,
  built, SVC-23b: §5.6 -- the counter above the ledger's highest, the reconciliation appending only what the ledger holds
  nowhere; a test. The abandoned lines stay below the later counters, §5.6)*; `deploy/README.md`'s
  reconcile sentence (a nit, owed); ~~**the abandoned lines in the void** (SVC-23b's review, §5.6 (a) and (b)): after a
  restore the void reads the abandoned history's lines as the account's later results once it plays again, and refuses
  before it does -- owed: a restore marker in the ledger (a line the restore writes, naming each account's restored
  mark, so a reader passes by the lines before it whose counter is above that mark), or the void bounded by the
  record's own marks.~~ *(2026-10-11, SVC-23g: built, §5.6's dated paragraph -- the restore's marker, owed in the
  rows' transaction and appended once after the commit or by the next open; `readLedger` reads the restored history
  only; the server's own bookkeeping. Reviewed 2026-10-11, PASS WITH FINDINGS: a torn append's fragment ended before the
  next line (one shared append), a failed marker append logged, `--list` marking an abandoned void -- fixed, §5.6.)*
  Left from it: **a void's line of the abandoned history** (§5.6): the marker does not name the restored voids, so a
  match voided after the backup is still refused `already-voided` after the restore (`--list` marks it
  `voidedInAbandonedHistory`) -- owed, if the operator ever needs to void such a match again: the marker naming the
  restored store's voids, and the reader passing by the void lines before it that it does not name.
- **H86 call 2** (`LADDER_PASSWORD_GAMES_PLACEHOLDER`): the owner's; the branch is built.
- ~~**H86 call 7** (`LEAVE_COST_PLACEHOLDER`): the owner's; the branch is built.~~ *(2026-10-10: already ruled, OT.R33
  call 7 (b); built as `LEAVE_COST_OWNER`, §2.3.)*
- **The readings of §6**, and the room's `roundMs` for a respawn room's first round (0: the round began at the room's
  construction, `roundStartTick` null -- SVC-12c's report, which no fold reads under respawn).
- ~~**SVC-23b**: the audit lines and flags from §1.5's signals; the bounds measured with the tree's bots.~~ *(2026-10-10,
  SVC-23b: built, §5 -- the signals lines, the eight flags by the operator's thresholds, the operator's CLI, the
  measurement and its verdicts (no bound changed); reading, reviewed 2026-10-10 -- PASS WITH FINDINGS, fixed; the
  server package's typecheck exit 0 at the merge, 4a282f254.)* Left from it: the thresholds' defaults
  (§6's fourteen `FLAG_*_PLACEHOLDER`s) until real matches give the populations; the same-address note (no address in a
  result); the measurement at a real connection's delay and loss (§5.4's injector is the page's own simulator, on one
  host); the view time held to a measured round trip, owed only if a ping is ever measured and the numbers move (§5.4);
  ~~a hit-share measurement with bots that aim at bodies (§5.4: the rig's bots hit nothing, so the cone's best point was
  read as distance only)~~ *(2026-10-11, SVC-23h: the bots that aim at bodies built and run, §5.4's dated paragraphs --
  no bound changed. The starved runs found and fixed (68e291062), both tables run again with the fix the same day, H186
  confirmed at 50 ms with n = 139. Left from it: **the honest in-sight hit share** -- no aimed round was in sight of the
  muzzle on MP2 (the bots do not find their way round the containers; the probe's sight test unchecked on its own), so
  the best point's in-sight gain is unmeasured; ~~the bots firing through their own reload~~ (the honest bots, both
  modes, hold fire as the page does, §5.4); the one `stale` at 100 ms (1 of 138, the old default bots; not recurred in the
  honest-bot run, 0 of 131; for the owner with H186); `cone: cone` refusals of honest centre rounds (three in about 1,550 default rounds, at 0 and 100 ms;
  for the owner with H186; recorded by the full run, not asserted, W18.R11); `stale`
  twice at 100 ms in the aim mode (the fix round's run); `reload or empty` twice at 100 ms in the default mode, the room's
  own-clock lock under the jitter to be read off the room;
  the aim mode outside the flags' assert by the coordinator's ruling, its `hit-share` flag at 50 ms recorded)*; the honest pages at 50 ms one way and more already clamped by the 200 ms view time (§5.4,
  for the owner: a loosened bound is no anti-cheat task); the flags' retention (SVC-04's, as the ledger's); the CLI in
  the image (as the void's).
- **SVC-23e** (2026-10-10; §4; reading, reviewed 2026-10-10 -- FAIL on one blocker, fixed, re-read PASS; the server
  and viewer packages' typechecks exit 0 at the merge, 52b49d9f0): built -- the room's `onRemoved` told in `applyVotes`, the
  bridge's `banFromGame` (the account's -972 for that game, for the game's life: `GAME_BAN_LIFE_PLACEHOLDER`), the
  room's address ban unchanged beside it (H170); VOTE ALL in the room (the toggle, the line per spectator, the 0.6
  threshold decided by the room for the host, the eject, MaxSpectatorsValve 0's refusal). Left from it: **the page's
  part** -- the TCM's SPECTATORS entry and its labels, the two lines and "EJECTED" drawn (`spectatorVoteText`,
  `SPECTATORS_EJECTED_TEXT`), the -972's UIMnLOC 443 / 444 and the refusal's MP_EJECT_SPECTATOR (§4.3); the game
  list's spectator slots after an eject (`VOTE_ALL_LISTED_SLOTS_PLACEHOLDER`); the refusal's life and the per-spectator
  lines at the proven level (ONL-32's rejoin transcript, the recomp's vote run with two spectators); the owner's H170
  (the address ban's scope). *(2026-10-11, SVC-23f: the page's part built, §4.5 -- reading, reviewed; left from
  it: ~~the two lines' one wiring line in `netPage.ts` (the seat's)~~ *(wired in the review's fix round)*; the listed
  slots, `VOTE_ALL_LISTED_SLOTS_PLACEHOLDER` kept with what was read; ~~`SPECTATORS_LOST_RETURN_READING`~~ *(read and
  retired, the TCM closed)*; the findings of §4.5 -- the TCM's other disabled rows drawn, ~~the team vote's line's
  colour~~ *(fixed in the fix round)*, the room's other refusals not mapped to the host's reasons.)* *(2026-10-11, the fix round's re-read, owed: **the room keeps a seat's VOTE ALL across matches, the page does not** -- `room.ts` holds `votesAll` / `voteAllMarks` through `resetMatch` (:5112-5114) while the page's toggle starts off with each match's chat (keyed on the client, disposed with the match): in a second match of the same room a seat whose vote did not pass shows REMOVE while the room still counts it; whether the original's host clears its per-slot +0x4a votes at the game object's teardown (`FUN_001fbae0`, D:L57780-57781 clears the page-side toggle only) is unread -- clear both in `resetMatch` once read, an SVC-23e seam, not this fix round's.)*
- **The proven level**: ONL-32's Medius log of a whole match on the local stack against the same match replayed in the
  room (each round's posts against the `RoomRoundResult`s through SVC-13a; the game over's post against the
  `RoomMatchResult` through SVC-12a), through PROVE-1 (built, research 267; merged 819d0967e; its server and tools
  typechecks held for the host's memory, to run in the close's package sets (the close record quotes them)). Nothing here is above a reading.
- **Review**: the re-read of every cite above by a reviewer who did not write it.
