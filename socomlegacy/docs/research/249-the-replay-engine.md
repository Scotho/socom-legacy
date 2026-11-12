# 249 -- The replay engine

> HF update, 2026-10-17: stationary/staged hostages in this note describe its historical replay tests. Live EXTRACTION now uses the shared planner and follower (research 333-334); those historical tests are not evidence of full physical following or original steering parity.

Written 2026-10-10 for RE-1 of web sprint 38 (the plan `docs/plans/2026-10-10-web-sprint-38-the-replay-engine.md`; the
design `docs/specs/2026-10-06-playtest-and-replay-design.md` §4.8-4.9). Each of the sprint's tasks writes its own
section here: §1 is RE-1's, §2 RE-6's, §3 RE-2's, §4 RE-3's, §5 RE-4's, §6 RE-8's and §7 RE-5's. The note stands on research 244 §7 (PTT-6's fold) and
research 240 (the format and the room recorder).

**W38.R1: the engine's surface is the modern tree's contract.** `ReplayClient` (load, seek, step, the clock) and the
segment HTTP (`/segments`, `/segments/<n>.s2r`, `/replays`) change only additively, and every change to either is named
in this note so that `agent/modern-ui` (MU.R9) can follow it. Each section has a "`ReplayClient` and the segment HTTP"
paragraph for this.

**No parity finding.** SOCOM II records no match and plays none back. The replay and its fold are a browser adaptation
(`REPLAY_ADAPTATION`, research 240 §3; PT.R3), and nothing here changes a game value or behaviour. What the fold tells
the page is what the recorded room would have told a page joining it at the target. Every rule below cites the room's
own join or its own handler for the event. The evidence is unit tests only (node and jsdom). No browser, game, dev
server or match server was run for this note.

## 1. The fold's engine-local residue (RE-1)

The code: `packages/viewer/src/replay/fold.ts` (the table, the fold, what is told) and its call in
`packages/viewer/src/replay/replayClient.ts` (`seekTo`, `take`, the new option). The tests: the new file
`packages/viewer/test/replayFoldResidue.test.ts` (jsdom: the fold, and a `NetPage` on a `ReplayClient` with the
drawers it reaches spied). PTT-6's own tests are unchanged: `replayFold.test.ts` (the table against the union, and the
bound) and `replaySeekFold.test.ts`.

**The rule** is still W37.R4's (244 §7): the stateful events up to the target are folded and told to the page as a page
joining at the target is told them. Nothing behind the target is played again. RE-1 adds the three items 244 §7.2 left
engine-local:
- a victory dance still running at the target;
- the charges lying there;
- the ghosts.

Each is told the way `packages/match/src/room.ts` `hello` tells a joiner.

### The dance

**What the room's join sends.** After the welcome, `hello` sends one `victory` per dance under way:
`{ type, id, serial, clip, elapsed }`, where `elapsed` is `(tick - start) / TICK_HZ` and there is no `seq` (`Room.hello`
`room.ts:1404-1406`). The joiner's `score` follows (:1409).

The welcome itself has no dance field. So "the welcome carries `victory`", in the brief's words, is read here as "the
join sequence carries it". The fold sends it exactly where the room does: after the welcome, before the score.

**The table.** `victory` moves from transient to stateful in `EVENT_CLASS`. That is safe, because "stateful" only
means "folded, and told as the join tells it". A seek never replays an event of either class. The page's handler for
the told `victory` only starts the dance's clip at its age, with no sound and no line:
- `NetPage.event` `case 'victory'` (`netPage.ts` :1340) calls `RemotePlayers.victory`;
- that calls `Play.startVictory` (`play.ts` :184).

So no shape other than the room's own `victory` was needed.

**The fold.** A start (a clip) records `{ serial, clip, tick }` for the seat. A start puts the seat last again, as the
room's `victoryPlaying` map re-adds it. A stop (no clip) deletes the seat's entry.

**What ends a dance.** In the room, every end goes through `Room.stopVictory` (`room.ts:1042-1050`), which broadcasts
the stop (:1049). The broadcast is recorded (`broadcast` -> `recorder.event`). These are its callers:
- `tickVictories` (:1081-1085): the dance's own end at its seconds, a death, the round over (phase `over`), an action,
  a hold or a pose;
- the mover's dance motion gone (:2234);
- a flinch (:3106) and a reload (:4195);
- a spawn (`spawn` :2405). This covers a new round (`startRound` spawns every seat, :4639) and a reset (`abandon`
  spawns the seats it holds, :1800);
- a leave (`drop`, :1608).

So a round end, a reset and a new round all reach the recording as stops, and the fold needs no rule of its own. A rule
of its own would be wrong. For example, clearing the dances at `roundOver` would drop a dance that the room keeps until
its next tick's `tickVictories`, and a joiner arriving in between would still be told it.

**What a seek tells.**
- For each dance the page holds that is not the one running at the target, a stop first, in the room's stop shape
  (`stopVictory` :1049). "The dances the page holds" means the ones it was last told by play (`take`) or by a seek.
  This is the seek's diff, as the roster's `left`/`joined` are.
- Then the welcome.
- Then each dance under way at the target, with its `elapsed` at the target, as `hello` sends it.
- Then the score.

**The page's limit (owed).** `Play.startVictory` refuses a dance in two cases (`play.ts` :187):
- its serial is at or below the last one the body started;
- the body is already playing a dance.

A joining page is always fresh, so the room never meets either case. A page that seeks does meet them:
- A seek back into a dance the page has already played draws no dance. The engine tells the start, and the page
  refuses its old serial.
- A seek within the dance that is playing leaves the clip at the age play had reached, not at the target's age. The
  engine tells the start at the target's age, and the page refuses it while the clip plays.
- After a seek back over a dance (to before its start), playing forward through it again draws nothing. Play hands on
  the recorded start, and the page refuses it: its serial is at or below `victorySeen`, which the first play set
  (the review, 2026-10-10).

The engine tells the right state; the page drops these three cases. The fix is on the page's side: reset the body's
`victorySeen` and stop its dance when a replay re-tells the welcome. That one reset covers all three. It lives in `play.ts` / `remotePlayers.ts` /
`netPage.ts`, none of which are RE-1's files. It is owed to a task with that window: LATER 31.

### The charges

**What the room's join sends.** The join envelope's `projectiles` holds every entry of `Room.flying` that is not
removed (`Room.joinWire` `room.ts:5170-5178`; `match/src/joinState.ts` `joinWire` :68-78, which leaves `removed`
out at :72):
- a thrown grenade, a launched round or a rocket, in flight or at rest;
- a charge, at rest or detonated;
- an AN-M8's smoke (detonated, until its `Timer2`).

**What RE-1 folds: the charges set down.** These are the `grenade` events whose kind's record the room sends to
`placeCharge`. The room's dispatch (`room.ts:1936-1938`) is `kindOf` -> `equipmentKind` (`viewer/src/equipment.ts`
:45). Kind 'placed' covers the claymore (153) and the PMN (158); kind 'c4' covers C4 (151). `placeCharge`
(`room.ts:3663-3700`) is the
only path that sets a charge down. Its broadcast carries the charge's `pid`, its owner (`id`) and its facing
(`velocity`).

The fold reads each charge's life from the recording, by the room's rules:

| step | the room | the fold |
|---|---|---|
| set down | `placeCharge`: `launchGrenade(from, [0,0,0])`, state `rest`, facing `velocity / |velocity|` (`room.ts:3694-3696`) | the `grenade` event with its `pid`. `pos` = `from`, `vel` = 0, facing normalised the same way |
| set off by damage | `chargeHit` (`room.ts:4131-4135`): queued, off on the next game frame, `detonate` broadcast | the `detonate` naming its `pid` |
| set off by the Detonator | `Room.detonate` (`room.ts:3708-3723`): every claymore (record 153) of the firer's, at rest, within `CLAYMORE_RULES.detonateRange` (500) of his feet; a `grenade` of kind `Detonator` broadcast from those feet | the same loop on the same numbers (the event's `id` and `from`) |
| C4's fuse | `stepGrenade` (`scene/src/projectile.ts` :1075-1081): the fuse counts from the placement, and a charge that does not hold its fuse (`holdsFuse` :749: not the claymore, not a proximity mine) detonates at 0 | detonated once `Timer1` x the tick rate has passed since the placement |
| a PMN's trip | `proximityTripped` (`scene/src/projectile.ts` :849-855) each game frame, against the living players' origins (`Room.flyGrenades` `room.ts:3869`, `:3880`), once its `Timer1` has run | the recorded snapshots (`REPLAY_PMN_TRIP_READING`, §1.1) |
| removal | `stepGrenade` (:1076, :1082-1084): `Timer2` also counts from the placement; a detonated one is removed once it has run | left out once detonated with `Timer2` run |
| the air cleared | `Room.clearAir` (`room.ts:3553-3558`) before the `roundStart` broadcast (`startRound` :4630) and the `abandoned` one (`abandon` :1797); `ROUND_START_PROJECTILES_READING` | every charge dropped at `roundStart` and `abandoned` |

**The wire.** `JoinProjectileWire`, as `joinWire` builds it from the room's `Grenade`:

```
{ pid, owner, kind, pos, vel: [0,0,0], state: 'rest' | 'detonated', age, fuse, removal, bounces: 0, dud: false, facing }
```

`age`, `fuse` and `removal` are in ticks, in the room's order of the flying list (the order of placement).

A detonated charge is listed until its removal, as the room lists it. The page lays nothing for it:
`GrenadeThrower.hydrateLive` returns for a detonated charge that is not a smoke (`grenade.ts` :1451). A hydrate never
emits `remoteRelease` (the release clip and sound, :1396), so laying a charge replays nothing.

**The records (W38.R1: the new option).** The fold needs each charge's `Timer1`, `Timer2` and `ProximityDistance`:
- The claymore's are in the baked transcription (`@s2u/scene` `CLAYMORE`, which is also the room's fallback,
  `BAKED_THROWN`, `room.ts:562`).
- C4's and the PMN's come off the disc only (research 94 §C5: C4 `Timer1` 6 s; the PMN `Timer1` 8 s and
  `ProximityDistance` 1 m). Their `Timer2` is not transcribed there.

So `ReplayClientOptions.throwable(kind)` hands the fold the page's records. Without the option, the fold uses the baked
set (`bakedThrowable`), and C4 and the PMN are not folded: no value is made up for them.

**Owed: the page holds no C4 or PMN record in replay mode, so neither does the fold.** The gap is the page's, not
only the mount's (the review, 2026-10-10):
- `GrenadeThrower` takes the disc's records only at the local seat's spawn (`matchThrow.ts` `spawnEquipment`
  :257-259, called from `spawned` at :410). A replay's watcher never spawns.
- So in replay mode the page holds only the baked set: M67, HE, AN-M8, Mark141 and the claymore (`grenade.ts` :107,
  `THROWABLES`). `launchRemote` drops a kind it has no record for (`grenade.ts` :1393-1394). It drops C4 and the PMN
  even in forward play, and it would drop them from a seek's envelope too.
- The fold's baked set (`bakedThrowable`) is the page's set today, so the two agree.

Wiring `mount.ts` to pass `throwable` alone would gain nothing. The fix is for the page to give `GrenadeThrower` the
disc's records in replay mode, and then for the mount to hand the same records to the fold. Both are in files outside
RE-1's. Until then, the test room's replay folds and draws the claymore only (LATER 32).

**Not folded, owed:**
- **A grenade, round or rocket in flight at the target, and an AN-M8's smoke.** The room's join carries them, but where
  each one is at the target is the room's flight against the map's hull from its launch (`stepGrenade` with a
  `HullCast`). The recording holds no rest point to read. Folding them would mean running a second flight in the fold.
  ~~The ones already in flight at the old playhead are RE-4's to clear.~~ (done at RE-4, §5: cleared at the seek)
- **A takeover's charges.** `Room.seat` hands a taken-over seat's projectiles to the new id (`room.ts:1677`) without a
  broadcast. The fold keeps the old owner, so a Detonator fired by the new id does not set those claymores off in the
  fold. The `players` record does not say that a takeover happened, so this is owed with the recorder (LATER 33).
- ~~**The page's copies from play.** A seek's envelope lays the target's charges by `pid`: it replaces a charge, never
  doubles one (`applyJoinState` -> `NetPage.joinSinks` -> `remoteGrenade` -> `GrenadeThrower.launchRemote`'s
  hydrate). But an envelope never takes a charge away. So a charge the page holds from play that is not there at the
  target stays drawn until the air is cleared. Two cases:~~
  - ~~a seek back before the charge's placement;~~
  - ~~a seek past a set-off whose blast lay in the skipped span.~~

  ~~Clearing the air on a seek is RE-4's (244 §7.2). After it, the envelope lays the target's charges alone.~~ (done at
  RE-4, §5: the seek clears the page's air first, and the envelope then lays the target's charges alone)

### The ghosts

**The room's rule.** `joinWire` (`joinState.ts` :81-84) names a seat a ghost when it is not alive and has no death
since the round's reset (`diedAt` < 0). Otherwise a dead seat is a corpse. `diedAt` is set at a kill (`Room.kill`
`room.ts:4237`) and goes back to -1 at `startRound` (:4639) and at `abandon` (:1800). A new seat is a new `Player`:
not alive, `diedAt` -1.

**The fold.**
- **The seats** are the players of the `players` records (role 'player' with a team), which are the room's `players`.
  The fold now reads those records in its pass.
- **A death since the reset** is the fold's corpse for the seat. It is made at a `kill` and dropped at the seat's
  `spawn` (PTT-6). RE-1 also drops it at `roundStart` and `abandoned` (the room's reset), and for a seat new to the
  roster.
- **Alive** is the target snapshot's `Alive` flag. That snapshot is the room's own view of every seat (`Room.snapshots`
  `room.ts:5121-5123`). A seat the snapshot does not hold yet was seated between it and the target; for that seat,
  alive means a `spawn` since it was seated.
- **Only a seat whose death the segment would show** (`FoldState.known`; the review, 2026-10-10). A seat counts once
  the segment shows one of these:
  - a reset (`roundStart` or `abandoned`);
  - the seat's own seating (a `players` record after the segment's first);
  - its `spawn`;
  - its `kill`.

Told as the envelope's `ghosts`, these reach `RemotePlayers.markGhost`, which draws nothing until the body is alive.

**A known limit: the seats a file opens with.** The server's `RoomRecording` (`match/src/replay/files.ts`
:311-346, its doc and `snapshot`) opens the next match's file at the next snapshot. It starts with the carried roster
and the events since the last file's close, still in phase `over`. So the seats killed in the previous file are still
dead, and their deaths lie in that file. The room's `joinWire` names them corpses (`diedAt` >= 0, `joinState.ts`
:83-84). A faithful corpse needs the death's tick and clip, which this file does not hold.

So the fold names such a seat neither a corpse nor a ghost: the page draws it as its snapshot draws it. It does not
make up a death, and a ghost would be wrong (it would draw nothing where the room draws a body). This holds until the
segment shows a reset, a spawn or a kill for the seat. A page's own room (the playtest recording) opens on a fresh
room, whose seats spawn as they are seated, so it meets this only before their first spawn.

**One change to PTT-6.** Clearing the corpses at a round start or an abandon is the room's `diedAt` reset. It changes
only one case. A dead seat left unspawned at an abandon (its ARMORY open, `arming`) is now a ghost, as the room names
it; PTT-6 named it a corpse. At a round start every seat spawns in the same tick, so nothing else moves.

### What the seek tells, in order

1. The roster's diff (244 §1).
2. The world, from the snapshot.
3. A stop for each dance the page holds that is not the one running at the target.
4. The welcome, with the envelope's result, `projectiles`, corpses, `ghosts` and drops.
5. Each dance under way.
6. The `score`.

The gate is PTT-6's: the fold is told only once a stateful event lies behind the old playhead or the new one.
`statefulRecord` now also counts a charge's placement. The `grenade` kind itself stays transient, because a grenade's
arc is W37.R4's example of a transient.

**PTT-6's guarantees hold.**
- Nothing transient is replayed. `grenade`, `detonate` and `shot` are read by the fold, never told. The told `victory`
  starts a clip, with no sound or line. A charge's hydrate runs no release, sound or blast. All of this is held by the
  new file's last test.
- PTT-6's tests pass unchanged, including the exhaustiveness test.
- The bound holds. The fold is still one pass, and the records visited are still the records at or before the target.
  Its new work is light:
  - a `players` record updates the seats;
  - a snapshot's bodies are read only while a charge lies, and only against an armed PMN.

  The bound's 30-minute segment has no charge, and its test still passes under `REPLAY_FOLD_BOUND_MS_ADAPTATION`.

### `ReplayClient` and the segment HTTP (W38.R1)

- **`ReplayClientOptions.throwable?(kind: string): ThrowableRecord | null`**: new and optional, so additive. The
  page's throwable records by the wire's kind. Absent means the baked set.
- **What a seek tells**: no new event kind and no new shape. The changes are:
  - `victory` is told on a seek: a start after the welcome, and a stop before it;
  - the welcome's `join.projectiles` and `join.ghosts` are no longer always empty.

  Every one of these is something a page joining a room already receives.
- **`fold.ts`**: an internal module, not part of the contract, listed for completeness. Every change is additive:
  - `foldTo`, `foldEvent` and `statefulRecord` take an optional trailing `throwable`;
  - `foldedJoin` returns `victories` beside `welcome` and `score`;
  - `FoldState` gains `dances`, `charges`, `seats`, `spawned`, `known` and `rostered`;
  - new exports: `FoldedCharge`, `ThrowableLookup`, `bakedThrowable`, and the two readings below.
- **The segment HTTP**: unchanged.

### Evidence

Unit tests only. `replayFoldResidue.test.ts` (21 tests, jsdom) covers:
- **the dance**: told at its age after the welcome; a stop told past its end and before its start; the last start
  since its stop;
- **the charges**: a claymore at rest in the room's wire shape; none before its placement; detonated after a
  `detonate` and gone at its removal; the Detonator's reach and owner; the air cleared at a round start and an abandon;
  C4 by its fuse, given a synthetic record; a kind with no record not folded; a thrown grenade not folded; a PMN
  tripped by a recorded body, and not by a dead one or before its arming;
- **the ghosts**: a ghost seated in play, and none after the next round; an abandon's dead seat a ghost; a file
  opening on the last match's end, whose dead seats are no ghosts (the review's case);
- **nothing transient replayed.**

PTT-6's `replayFold.test.ts` and `replaySeekFold.test.ts`, and `replayClient`, `replayMode`, `replaySpectate`,
`replayEmbed` and `matchActions` all pass, unchanged.

~~Not seen rendered: a running dance and a placed charge on a replayed page are RE-5's (the plan's RE-5 row).~~ The
placed charge was seen rendered at RE-5 (§7.3); a running dance stays unseen, as no offline recording holds one (§7.2).

### 1.1 Placeholders

| name | value | where | status |
|---|---|---|---|
| `REPLAY_CHARGE_CLOCK_READING` | 'recorded ticks' | `packages/viewer/src/replay/fold.ts` | a reading of the adaptation's precision, not a game value. A charge's age, its set-off and C4's fuse running out are read on the recording's ticks. The room steps projectiles by game frames (`GameFrameAccumulator`, 525/15734 s) and sets a triggered charge off on its next frame, so each is within about one game frame of the room's. It is settled only if the recorder writes the flight clock's phase, which no task asks for |
| `REPLAY_PMN_TRIP_READING` | 'recorded snapshots' | `packages/viewer/src/replay/fold.ts` | a reading: an armed PMN's trip, which the room does not broadcast, is tested against each recorded snapshot's living seated bodies. The room tests every game frame, so a body crossing the 1 m radius between two snapshots (every other tick) is missed. It is settled by a recorded trip: a `detonate`-like broadcast from `flyGrenades` when `proximityTripped` fires (a room change, additive) |

No `*_PLACEHOLDER`. C4's and the PMN's records are the disc's, through the page (`throwable`). None is stood in for.

## 2. The developer's replay mode (RE-6)

Written 2026-10-10 for RE-6. The code: `packages/viewer/src/replay/timeline.ts` (`parseListing` keeps each segment's
map), `replay/embed.ts` (`seekAddress`, `replaySeeker`), `replay/mount.ts` (the one listing read handed to the seek), and
`replay/replayClient.ts` (`homeTick`, `seekStart`). The service's listing (`packages/playtest/src/segmentsHttp.ts`) is
unchanged: its entries have named their `map` since PT-20 (the record's, `segmentListing`); only its comment now names
the readers. Like §1, a browser adaptation with no original (`REPLAY_ADAPTATION`; PT.R3).

### One map per cross-segment seek

Before, the replay frame was opened on segment 0's map (the report's `src`, `map=<its map>`), and a seek into a
segment of another map reopened the page with `replay=` and `tick=` only. The page loaded the old map, the map rule
(`./mount` `replayMapAddress`, 244 §2) refused it ("Opening the recording's map, MP2.") and reopened on the header's
map: two loads (244 §7.3, seen at PTT-7). Now:
- the timeline's `parseListing` keeps each segment's `map` when it is a map stem (`MAP_STEM`, `../shareUrl`'s rule,
  restated); one that is missing or not a stem is left out;
- `replaySeeker` takes the same listing promise the timeline reads (one `GET /segments` a page, `./mount`), waits for it
  to settle, and reopens with `map=` the target segment's (`seekAddress`'s new optional `map`, written in upper case as
  the map rule writes it). The seek on the segment playing and the seek within a file that is not a session segment
  stay in place, unchanged;
- the wait is bounded (the review's round): past `REPLAY_LISTING_WAIT_MS_PLACEHOLDER` (1.5 s, §2.1) without the listing,
  the page reopens on the address's own map, as with no listing, so a `/segments` that hangs costs the old two loads,
  never the seek. And the latest seek wins: a seek made while a cross-segment reopen still waits (the report's next
  card, a click on the timeline) cancels it, so an earlier seek's late reopen never overrides a later one;
- with no listing, a listing that failed, or no map for that segment, the address keeps its own `map=` and the map rule
  corrects it on open, as before. A wrong map in the listing costs one extra load, never a refusal: the map rule refuses
  only when the address already names the header's map.

**The listing's consumers, checked:**
- the timeline (`timeline.ts`): layout, boundaries, marks and clicks are unchanged. `map` rides along on
  `TimelineSegment` and `layoutTimeline` does not read it;
- the embed (`embed.ts`): the seek above;
- the report's replay frame (`packages/playtest/src/report/page.ts` `replayFrameSrc`): it does not read the listing. Its
  iframe is still opened on the first recorded segment and that segment's own map, and a seek posts
  `{ segment, tick }` to the frame, which reopens itself. The iframe's `src` parameter set is unchanged, so
  `reportPage.test.ts`'s "exact parameter set" test is untouched and still truthful.

### Home lands on the round's first tick

`ReplayClient.seekStart()` (Home on the bar's keys, `./controls`) seeks to `homeTick(records, start)`:
- **the first `roundStart` event's tick.** `Room.startRound` (`packages/match/src/room.ts:4622-4652`) resets the
  world, the doors, the bomb (`this.bomb?.reset()`, StartBomb, state 1, broadcast), the hostages and the turrets,
  spawns every seat, and broadcasts the `roundStart`, all on one tick. So at that tick the fold has the round in play
  (`fold.ts` `foldEvent`: `roundStart` sets the phase `play`) and the bomb at its reset. `BombPage`'s phase gate is
  then open and the compass shows the bomb. The protocol has no `phase` event: the phase is a welcome field, folded from
  these events. The `roundStart` is the recording's one record of a round beginning.
- **the segment's start** when there is no `roundStart`, or when the round was already running as the segment opened.
  That case shows as an event the room sends only inside a round, before any `roundStart`: `roundTime`
  (`Room.penaltyMinute`, in `play` or `decided`), `timeExpired` and `eliminated` (`Room.clock` in `play`), and
  `roundOver` (`Room.endRound`). It is the respawn room's: its first round is in play from its construction with no
  `roundStart` (the `Room` constructor's state, room.ts:1292; `hello`'s welcome `startTick` 0, :1395), and round 2's
  `roundStart` follows round 1's `timeExpired` and `roundOver`. Without this guard, Home would skip that round's play.
- `abandoned` is not taken as a round. The room also abandons its launch hold, before round 1 (`Room.clock`,
  room.ts:4284, `if (st.hold) this.abandon()`; `abandonIfSideEmpty`'s `held`, :1780).

This departs from the plan's RE-6 brief, which says "the first tick with a round state, or 1 if none": with no round
state Home lands on the segment's own first tick, not tick 1, because a segment need not begin at tick 0 (a server's
file opens at the room's first snapshot of its match, at whatever room tick that is, `RoomRecording`), so a fixed tick 1
could lie before the recording or inside it arbitrarily, and with no round to wait for there is nothing to skip to.

Seen on PTT-7's recording (244 §7.3): the segment's first tick is 0, and its first `bomb` event and the round's reset
are at tick 1. Home now lands on tick 1, not 0. Explicit seeks still go anywhere: `seek(0)` lands on tick 0 with an
empty compass, as before. The rule changes only `seekStart`. A classic room's recording opens before its first round
(the server's `RoomRecording`, one file a match; a session's segment at its room's build, `playtestSession.ts`), so for
those Home is the first round's reset.

### `ReplayClient` and the segment HTTP (W38.R1)

- **`ReplayClient.seekStart()`**: the same signature; it now lands on `homeTick`'s tick. **`homeTick(records, start)`**
  is a new export, a pure function.
- **`seekAddress(search, url, tick, map?)`**: a new optional fourth argument. A call without it is unchanged.
- **`replaySeeker({ ..., listing? })`**: a new optional option. Without it, the reopen is synchronous and unchanged.
  With it, the reopen waits at most `REPLAY_LISTING_WAIT_MS_PLACEHOLDER`, and a later seek cancels a waiting one.
- **`REPLAY_LISTING_WAIT_MS_PLACEHOLDER`**: a new export of `embed.ts`.
- **`TimelineSegment.map?`**: a new optional field. `parseListing` fills it.
- **The segment HTTP**: unchanged. `/segments` already carried `map` on every entry, and now the replay's timeline and
  seek read it.

### Evidence

Unit tests only (jsdom), no browser run:
- `replayTimeline.test.ts`: the listing keeps each segment's map and drops a non-stem;
- `replayEmbed.test.ts`: `seekAddress` sets `map=` in place or appends it, and keeps the address's own map without one;
  `replaySeeker` with a listing reopens on the target's map, keeps the address's map for a segment the listing names
  none for, and does the same for a failed listing; a listing that never settles reopens at the limit, not before,
  on the address's map, once (fake timers); the latest seek wins (into segment 1 then in place: no reopen; into 1 then
  2: one reopen, on 2's map); in `./mount`, the report's seek into a segment of another map reopens with that map;
- `replaySeekFold.test.ts`:
  - Home from past the pickup lands on the reset's tick 1, not 0, and the compass shows `ret_bomb` at the ground place
    (a `BombPage` on the replay's client, its HUD frame read). An explicit seek to 0 shows none;
  - a round after a countdown: Home lands on its `roundStart`;
  - no round state: the start;
  - each in-round event before the `roundStart`: the start;
  - an abandon before it: the `roundStart`.

`segmentsHttp.test.ts` already held the listing's `map` (MP2, MP2, MP5), and it, `reportPage`, `replayClient`,
`replayMode`, `replayFoldResidue` and `launchSettingsTable` pass unchanged.

**The e2e** (`packages/viewer/e2e/replayPaths.spec.ts`) is edited to match, and the edits are **not yet run** in a
browser:
- case 5's Home step is now asserted: the tick is the first `roundStart`'s, and the bomb is on the ground in the
  compass;
- case 3's Home expects that tick;
- case 2 asserts that the first reopened address already names `map=MP2`;
- case 4's comment is reworded.

The spec restates the rule (`home`) and does not import it. 244 §7.3 records the same.

### 2.1 Placeholders

| name | value | where | status |
|---|---|---|---|
| `REPLAY_LISTING_WAIT_MS_PLACEHOLDER` | 1500 ms | `packages/viewer/src/replay/embed.ts` | a chosen instrument limit with no original (REPLAY_ADAPTATION; the review's round): how long a seek into another segment waits for the service's `/segments` listing to name the segment's map before it reopens without it. The same order as `SERVICE_PROBE_MS_PLACEHOLDER` (research 243 §3), the launch sheet's wait on the same local service. Settled only by a measured listing time on a slow host, which no task asks for; past it the cost is one extra map load, never a lost seek. Never a deviation of the round (research 101 §5) |

The Home rule adds no name: it is read off the room's own broadcasts (cited above), and `MAP_STEM` restates
`../shareUrl`'s address rule, which is not a game value.

## 3. Hostages as state (RE-2)

Written 2026-10-10 for RE-2 (W38.R2). The code:
- the format, `packages/match/src/replay/format.ts` (the `hostages` kind, tag 8; `REPLAY_FORMAT_VERSION` 2;
  `REPLAY_FORMATS`; the reader's skip);
- the recorder, `replay/recorder.ts` (`RoomRecorder.hostages?`, `FileRecorder.hostages`) and `replay/files.ts`
  (`RoomRecording` holds the roster for the next file; `SegmentRecorder` counts its tick);
- the page's recorder seam, `packages/viewer/src/playtestSession.ts` (one forwarding line, beside `command`);
- the fold, `packages/viewer/src/replay/fold.ts`, and its call in `replay/replayClient.ts` (`open`, `seekTo`);
- the load's refusal sentence, `replay/load.ts`.

The tests: the new file `packages/viewer/test/replayHostages.test.ts` (jsdom: the fold, and a `NetPage` on a
`ReplayClient` with its hostage drawers and every voice spied), and new cases in `packages/server/test/replayFormat`,
`replayRecorder`, `replayFiles` and `packages/viewer/test/replayLoad`. Like §1, a browser adaptation with no original
(`REPLAY_ADAPTATION`; PT.R3): nothing here changes a game value or behaviour.

**Why** (244 §7.2): a hostage's name and model ride only the room's welcome (`Room.hello` `room.ts:1401`,
`hostages: this.extraction.wire()`), a per-recipient `send` the recorder never sees. The re-told welcome of a seek
carried no `hostages`, so the page's welcome handler emptied its hostage map (`netPage.ts:1261`), and the HUD's
compass marks, which come from that map (`main.ts:1594`, `NetPage.hostageMarks` `netPage.ts:1054-1062`), left the
compass until the next `hostageState`.

### The record

`{ kind: 'hostages', tick, hostages: HostageWire[] }`, tag 8, a JSON payload like the other JSON kinds. `HostageWire`
is the welcome's own type (`packages/viewer/src/net/protocol.ts`), unchanged: each hostage's `id`, `name`, `character`
(its model), `at` and `yaw` (its place), its state (`alive`, `ai`, `leader`, `rescuer`, `opacity`, `unit`) and, dead,
its `deathClip` and `age`. Nothing is added to it: the record is what `ExtractionAuthority.wire()` returns
(`extraction.ts:588`).

`FileRecorder.hostages(tick, hostages)` writes the record at its first call -- the segment's open, its own file's -- and
again only when the roster changes: each hostage's id, name and model, in order. A change of state or place writes
nothing, because the recording already holds both: the state in the broadcast `hostageState` and `kill` events, the
place in each snapshot's body (`room.ts:5124`, `ExtractionAuthority.bodies`). In the room as built the roster is fixed
for a room's life (`ExtractionAuthority`'s constructor makes the three from the map's escortee starts), so a file holds
one record. The rule writes another if a roster ever changes.

`RoomRecording` (the server's, one file per match) hands the roster to the open file, or holds the last one while no
file is open and writes it at the next file's open, after the carried `players` roster and the held events, so the
file's ticks stay in order: the fold's one pass stops at the first record past its target. The page's recorder seam
(`playtestSession.ts`, its `Target`) forwards it to the segment's file, as it forwards `command`; a re-targeted file
(`segmentRefused`) writes it at its own first call.

### The recorder's call site: `room.ts`, one line

No call the room already makes reaches the roster:
- `snapshot` carries the hostages' bodies (`Room.snapshots` `room.ts:5124`): their id, place, stance and life, but no
  name or model;
- `event` carries `hostageState` (`HostageStateWire`: no name, model or place) and `kill`;
- `players` carries the lobby's members only.

So the room hands it: one additive line, under the merge controller's window (the plan's Log grants one additive line
when the hook cannot reach the roster; `room.ts` claimed in HANDOFF §3), in `Room.snapshots` just before the existing
`this.opts.recorder?.snapshot(this.tick, list, doors, env);` (`room.ts:5132`; the new line is :5131). It is the only
change in `room.ts`:

```ts
if (this.extraction) this.opts.recorder?.hostages?.(this.tick, this.extraction.wire());   // RE-2 (W38.R2): the roster
```

- It is additive: the room's bytes to its connections are unchanged (PT.R2), and without a recorder, or with one that
  has no `hostages`, the optional calls evaluate nothing (`wire()` is not called).
- It is at each snapshot of a room with hostages because a file opens at a snapshot (`RoomRecording`; the page's
  segment rotates at a room's build), so whichever file is open receives the roster at its first snapshot. The
  recorder's own test writes nothing more while the roster is unchanged. Its cost is three small objects per snapshot
  in an EXTRACTION room, and only while recording.
- Held by `replayRecorder.test.ts` on an EXTRACTION room (`roomExtraction.test.ts`'s map: the flat floor made game type 4
  with three escortee starts at test places, named as the disc names them -- `Hostage`, `Hostage2`, `Hostage3`, models
  `mp_fem1`-`3`, copied from `roomExtraction.test.ts:35`, decoded data RS.R8 allows; no disc read): with a `FileRecorder` the file holds one `hostages` record, just
  before its first snapshot and at its tick, with the welcome's fields; with no recorder, or one without `hostages`, a
  step never calls `wire()`, and the bytes to the pages are the same as with a recorder.

### The reader's tolerance and the version (W38.R2)

The format-1 reader cannot skip the new kind: `decodeRecords` threw `unknown replay record tag` on any tag it did not
know. W38.R2's own rule therefore applies, and the version moves:
- `REPLAY_FORMAT_VERSION` is 2: every file written from now on says 2.
- `REPLAY_FORMATS` is `[1, 2]`: this build reads both. A format-1 file reads exactly as before and has no roster. A
  format-3 file is refused (`unsupported replay format 3 (this build reads 1, 2)`; the page says
  "this build reads versions 1 and 2").
- **From format 2 the reader skips a record whose tag it does not know**, by its length, and counts it in
  `skipped` (a key present only when one was skipped). An older viewer therefore reads a newer file, and a later kind
  needs no new version. In a format-1 file an unknown tag is still a corrupt file, since no format-1 writer had one.
- A format-1 reader (any build before this one) meets a format-2 file and refuses it by its version, in words ("this
  build reads version 1"), rather than calling it damaged at tag 8.

Why bump rather than only teach the reader to skip: the readers already out there are the format-1 ones (the lane's
own earlier builds, `agent/modern-ui`'s tree until it takes this one), and none of them can skip. A version they refuse
by name is the honest answer for them, and the skip makes this the last bump an additive kind needs.

The other readers of the version, checked: the session service (`packages/playtest/src/service.ts:341`) takes a page's
segment only at `REPLAY_FORMAT_VERSION`, and the page writes that same constant (`playtestSession.ts`), so a page and
its service of one build agree. The server's own `REPLAYS_DIR` files carry the server's version. The listing, the
sidecar and the retention read no version.

### The fold

`fold.ts`, one pass as before:
- a `hostages` record sets the roster (`FoldState.hostages`, null before any): each hostage's wire and, dead, its
  death's tick (the record's tick less its `age`) and clip;
- a `hostageState` for a hostage on the roster sets the seven state fields, as the page's own handler does
  (`case 'hostageState'` `netPage.ts:1440-1443`). Alive again (the round's reset, `ExtractionAuthority.reset` then
  `tellAll`) clears its death, as the room's reset sets `diedAt` to -1;
- a `kill` with `victimKind: 'hostage'` sets it dead, its death's tick the event's and its clip the event's, as
  `ExtractionAuthority.killed` (`extraction.ts:541`) keeps `diedAt` and `deathClip`.

`foldedHostages(state, target, bodies)` gives the welcome's `hostages` as `wire()` gives them: in the roster's order,
the place from the hostage's body in the snapshot at or before the target, the state last told, and a dead one's
`deathClip` and `age` (`target` less its death's tick: the room's `!alive && diedAt >= 0`). A hostage the target's
snapshot does not hold (hidden: the fade's end, `ExtractionAuthority.bodies`) keeps the place of the last snapshot that
held its body, which the fold keeps as it passes each snapshot once a roster is read (`foldHostagePlaces`), else its
record's. That is the room's own place for it, exactly: the room moves a hostage only at a round's reset
(`extraction.ts:419-420`, `h.at` and `h.yaw` to its start), which makes it visible again; Follow holds its point as
built (`hostageAi.ts` `FOLLOW_MOTION_PLACEHOLDER`), and a hostage that does move later (HX-4b's planner) moves while
visible, in every snapshot. So a hidden hostage stands where it was last drawn. (RE-2's first cut gave the
record's place under a reading; the review's F3 retired it, §3.1.) The cost is one look-up per body of each snapshot
after the roster, none in a file without one, so PTT-6's bound test is untouched.

`statefulRecord` counts a `hostages` record, so a seek past it re-tells the welcome (PTT-6's gate).

**A hostage's corpse.** The room's join envelope holds its seats' corpses only (`joinWire`); a hostage's death rides
`hostages`. Once a roster is read, the fold leaves a hostage out of the envelope's corpses, and the welcome handler
lays it (`hydrateCorpse`, its clip at its age). Without a roster -- an older file -- the envelope still lays it, as
before RE-2.

### What the seek and the open tell

- **The open**: the first welcome carries the roster at the segment's open. That is its first snapshot's tick, or its
  start if later, because a file's roster is handed at its first snapshot and the page draws the first snapshot's
  bodies until the clock reaches it. A seek to a tick before that open tells the open's roster for the same reason.
- **A seek**: the re-told welcome carries the folded `hostages`. The page's welcome handler lays them silently: the
  map, `setEscortee`, `setOpacity`, the corpse at its age. No `hostageState` is told, so no YES (`escorteeVoice`), no
  Lead or Rescue line (`roundAudio.hostage`), and no `deps.hostageState`, all held by the test. Play after the seek
  goes on through the live handler, as before.
- **A file with no `hostages` record** (format 1, a format-2 file of a room with no hostages, or one cut before its
  first snapshot) tells no
  `hostages` on the open or a seek, as before RE-2: no marks. Held by its own test.

**Left on the page, not in the fold** (owed, `netPage.ts`, the online seat's file): the page's per-round memory of
the Lead and Rescue lines (`hostageSaid`, cleared only at a `roundStart`, `netPage.ts:1431`) survives a seek. A seek
back across a rescue the page played keeps that hostage's mark off the compass until the next round
(`hostageMarks` reads `hostageSaid.rescued`), and a seek back across a Lead keeps its line from playing again. It is
for RE-3's window on `netPage.ts`, or RE-5's rendered check, to settle. (Done at RE-3, §4: a seek's welcome clears it
in the replay mode.)

### `ReplayClient` and the segment HTTP (W38.R1)

- **`ReplayClient`**: no signature changes. What it tells is additive: the opening welcome and a seek's welcome carry
  `hostages` when the file holds a roster -- the field a page joining an EXTRACTION room already receives.
- **The format** (`match/src/replay/format.ts`): additive kinds and exports. The new record kind `hostages` (tag 8),
  `REPLAY_FORMATS`, and `decodeRecords`' optional `skipped`. **`REPLAY_FORMAT_VERSION` moves from 1 to 2**, argued
  above. A reader at this tree's version reads both formats. **A viewer built before RE-2 refuses a format-2 file by
  its version** ("This recording's file format is version 2; this build reads version 1."), so a recording made from
  now on does not open in one. `agent/modern-ui` reads recordings through this repository's `ReplayClient` (and so this
  format module, through `load.ts`), not a reader of its own (MU.R9): once it merges `main` with RE-2 in it, it reads
  both formats and nothing more is owed there.
- **The recorder**: `RoomRecorder.hostages?` is optional, so every recorder without it still compiles and records as
  before.
- **`fold.ts`**: an internal module, listed for completeness. `FoldState.hostages`, `FoldedHostage`,
  `foldedHostages`, and `FoldedWelcome` gains `hostages`.
- **The segment HTTP**: unchanged. `/segments/<n>.s2r` and `/replays/<id>` serve the files as they are; a format-2 file
  is served as any other.

### Evidence

Unit tests only (node and jsdom). No browser, game, dev server or match server was run.
- `replayFormat.test.ts`: a realistic format-1 file with every v1 kind (a `format: 1` header, `players`, `snap` with
  bodies, doors and environment, `event`, `cmd`, `mark`, `end`) decodes record for record, deep-equal, under the v2
  reader, with no `skipped` (the `snap` and `cmd` as the wire's own codec round-trips them). RE-2 left the encoder of
  the v1 kinds unchanged (`payloadOf`, `encodeRecord`, tags 1-7; the codec files untouched since the base `ea2d6e479`),
  so the current encoder stands in for the base's. Research 240 §1 names the formats read. The record round-trips
  with every welcome field, a dead one's clip and age among them; the
  version is 2 and format 1 still reads; a format-2 file with two records of unknown tags (99 and 200) reads with them
  skipped (`skipped: 2`), and one cut short is a truncated tail; a format-1 file with an unknown tag is still refused; a
  decode with nothing skipped has no `skipped` key. The existing "another format" case now uses format 3.
- `replayRecorder.test.ts`: `hostages` is optional on the hook; the record is written at the first call with every
  field; a change of state or place writes nothing, while a change of name, model or ids writes it again; each file
  writes its own; nothing after the close.
- `replayRecorder.test.ts`, the room's line: an EXTRACTION `Room` with a `FileRecorder` records the roster once,
  before its first snapshot; with no recorder, or one without `hostages`, a step never calls `wire()` and the pages'
  bytes are unchanged.
- `replayFiles.test.ts`: `RoomRecording` holds the roster before a file opens, writes it after the carried roster and
  events, and writes it again into the next match's file; the file's ticks are in order.
- `replayHostages.test.ts` (9 tests):
  - the open's welcome carries the roster, and the marks stand;
  - a seek past a `hostageState` keeps the roster with the place at the target and the state told;
  - a seek past a hostage's kill tells it dead with its clip and age, lays its corpse through the welcome only, and
    leaves it out of the envelope's corpses; a seek back brings it back;
  - a round's reset brings a dead one back;
  - a rescued one keeps its state and fade, and a hidden one keeps the place of the last snapshot that held it, which
    the test sets apart from its record's place (the review's F3);
  - play after a seek goes on through the live handler;
  - the fold reads the record at or before the target;
  - no voice in any of them;
  - a file with no record tells no `hostages` and no marks, and an older file's hostage kill is still laid by the
    envelope.
- `replayLoad.test.ts`: a format-1 file loads; another format's sentence names versions 1 and 2.

PTT-6's `replayFold.test.ts` (the table and the bound) and `replaySeekFold.test.ts`, RE-1's
`replayFoldResidue.test.ts`, and `replayClient`, `replayMode`, `replaySpectate`, `replayEmbed`, `replayTimeline`,
`loopbackRecorder`, the server's `replayBridge`, `replayHttp`, `replaySidecar`, `replayRetention` and
`replaySweepBound`, and the playtest package's `service`, `segments`, `anotherServer` and `playtestSession` all pass,
unchanged.

~~Not seen rendered: the compass marks after a seek on a replayed page are RE-5's.~~ (seen at RE-5, §7.3: the marks in
the HUD's model; a replay's watcher draws no HUD, §7.2)

### 3.1 Placeholders

| name | value | where | status |
|---|---|---|---|
| `REPLAY_HIDDEN_HOSTAGE_PLACE_READING` | 'the roster record place' | (was) `packages/viewer/src/replay/fold.ts` | retired at RE-2's review (F3), 2026-10-10: the fold now gives a hidden hostage the place of the last snapshot that held its body, the room's own place for it (the room moves a hostage only at a round's reset, which shows it again); nothing stands in |

No `*_PLACEHOLDER`, and no reading left: RE-2 adds no named stand-in.

## 4. The replay's clock (RE-3)

Written 2026-10-10 for RE-3 of web sprint 38 (W38.R3; research 244 §7.2's clock, figure and countdown items). The
change to `netPage.ts`, the online seat's file, is made in the window it granted on five conditions (the plan's
`### RE-3`, verbatim there). This section says how each is met.

### The clock reaches the page through its client

The replay's clock is a capability of the page's client, read the way PT-19's `dtScale` is read
(`netPage.ts:1131`, `(this.client as { dtScale?(): number }).dtScale?.() ?? 1`). In the replay mode `NetPage.client`
is the `ReplayClient` itself (`asNetClient` is only a cast), and it carries `pageClock()`.
- `NetPage.replayClock()` (`netPage.ts:611-613`) resolves the clock: the optional dep
  `NetPageDeps.replayClock?: { now(): number; stoppedFigure(): number | null }` (:243, the tests' injection point),
  else the client's `pageClock?.()`, else null. It is read lazily at each use, so a client made by a reconnect's
  `open()` is the one read.
- `NetPage.now()` (:615-618) reads that clock's `now()`, and `performance.now()` when there is none.
- A live `NetClient` has no `pageClock` and the live page passes no dep. Each read is still exactly one
  `performance.now()`, in the same order, at the same places.

`main.ts` is untouched: the test room's replay branch builds its `NetPage` with the factory alone, as before RE-3. So is
`replay/mount.ts`.

**The reads that use it** -- every read that serves the round timer, the launch countdown and the round screens:
- the round's end, `endsAt`: set at `roundStart` (:1423), `timeExpired` (:1411) and a `score`'s `timeLeft` (:1486);
  drawn by `frame` (:1135) and by `roundTime` (:1438);
- the launch countdown, `launchAt`: set by `countdown` (:1091), drawn by `frame` (:1134);
- the round's screens: their start at `roundOver` (:1481) and in a join envelope's result (`applyJoinState`'s `nowMs`,
  :1257, used only for the screens' start, `joinState.ts:69`); read by `roundScreen` (:1110) and `nextRoundIn` (:1035).

**The reads left on the wall clock**, none of them the round timer's, the countdown's or the screens' schedule:
- `joinedAt` (:609) and the round screen's `timePlayed` (:1119): the page's own time in the room. It is set when the
  page is built, before the replay's client exists; and in the replay the watcher has no row, so YOUR STATS has nothing
  to show it on;
- the reconnect's backoff (:758, :818) and a `refused`'s 'server closing' window (:1523): the socket's;
- the page's own seat: the dead player's prompt (:961), the respawn prompt (:1137), a ghost's start (:1196), its own
  death clip (:1306, :1312) and its flinch (:1346-1347). The replay's watcher (`REPLAY_WATCHER_ID`) is no seat, so none
  of these is reached in the replay mode.

### The replay's clock

`ReplayClient.pageNow()` (`replayClient.ts:311-315`) is the replay's time in milliseconds: a tick x 1000 over the
recording's tick rate (its header's `tickHz`). The tick is the one of the record being told to the page while one is
(`telling`):
- each record `playTo` hands on (:266);
- the seek's target while its welcome, dances and score are told (:389);
- the start while the opening welcome is told (:225).

Otherwise it is the replay's tick now (`serverTick`: standing still when paused, scaled by the speed, `clock.ts`). So a
`roundStart` sets the page's clock from its own tick, not from the frame that played it, and a round played through and
the same round reached by a seek read the same figures. It is 0 before the recording opens. `ReplayClient.pageClock()`
(:325-326) hands `pageNow` and `stoppedFigure` in the dep's shape, one object a client. The page reads each replay's own
clock off that replay, so no module holds a "last made" client.

### The round-end screens

Their live timing is untouched, as the online seat's condition 2 asks. `ENGINE_READ_S` (`netPage.ts:482`, 3 s after
`roundOver`) and the screens' seconds as the room names them (`FINAL_ROUND_S`, `GAME_COMPLETE_S`, `ROUND_COMPLETE_S`,
`match/src/room.ts:228`) are not changed, and the live page reads them on `performance.now()` as before. SVC-23d's vote
kick lands at those screens' start (research 263 §5.2), so its visible moment does not move.

In the replay mode the screens follow the replay's clock through the same `now()`, with the same constants: paused, a
screen stands; at 2x, it runs at 2x. No change to the live path was needed for this, so the screens are not left on the
wall clock in the replay.

### The three seek cases (the replay mode only)

All three are in the welcome handler, under the replay's clock (`replayClock()`, :1244 and :1262), so the live page
never runs them. In the
replay mode every welcome is the replay's own: its opening one, or a seek's (`ReplayClient.seekTo`).

- **The figure in a stopped period** (244 §7.2). The page draws no timer while neither its round clock nor its
  countdown runs (`frame`, :1134-1135), so the live page keeps the last figure it drew:
  - the round's seconds left at a `roundOver` or an `abandoned` (0 once its time expired);
  - the countdown's at an `abandoned` in the load hold;
  - the round's length when a countdown is called off (`countdown`'s `setTimer(this.roundSeconds)`);
  - the HUD's six minutes (`hud.ts` `DEFAULT_MODEL.timer`) before any.

  The fold keeps that figure (`FoldState.figure`, set by `drawnFigure` at each stop, `fold.ts:268, 274, 285`), and the
  page's countdown as the page holds it (`FoldState.launchEnds`, which an abandon clears; `countdownEnds` is not
  cleared by one). `foldedFigure` (`fold.ts:460-464`) gives the figure at the target, or null where a clock runs there:
  the round's (the seek's `score` starts it) or a countdown still running (the welcome's `countdown` starts it). A
  countdown run out with no round yet (the room's load hold) gives 0, the figure its clock stopped on.
  `ReplayClient.stoppedFigure()` holds the last seek's, and the page's welcome sets the timer to it
  (`netPage.ts:1268-1269`). Before round 1 that is `PAGE_FIGURE_DEFAULT_S` (`fold.ts:172`, 6 x 60): the HUD's own first
  figure and the page's round length until a `roundStart`, held equal to `DEFAULT_MODEL.timer` by the test.
- **The countdown line** (244 §7.2). The welcome handler cleared `launchAt` before telling the countdown, so the fold's
  welcome into a countdown the page already held posted "GAME STARTS IN n SECONDS" again. In the replay mode, a welcome
  that carries a `countdown` keeps the page's `launchAt` (`netPage.ts:1244`). `countdown`'s own same-countdown test
  (`COUNTDOWN_SAME_MS`, the sprint-5 fix) then finds it the same launch, on the replay's clock. A seek from outside a
  countdown into it posts the line once; a seek within it posts none.
- **`hostageSaid`** (§3, RE-2's review). A seek's welcome clears the Lead and Rescue one-shots, as a fresh joiner's
  page starts with them empty (`netPage.ts:1267`). A seek back across a rescue puts the hostage's compass mark back
  (`hostageMarks` reads `hostageSaid.rescued`). Played on from there, the rescue's line and stream play again, as they
  did at that moment. The test fails when only this clear is removed and `roundStart`'s own clear (:1431) is kept,
  since the seek's welcome crosses no `roundStart` (run once at RE-3's review round, then restored).

### The live path, byte-equal (condition 1)

`netPageClock.test.ts` drives a live `NetPage` (no `replayClock`) through a fixed sequence on a fake socket:
- a countdown told by the welcome and again by the broadcast, called off and told again;
- two rounds: a minute taken off, the hostages' Lead and Rescue, time expired, an elimination;
- ROUND COMPLETE, FINAL ROUND and GAME COMPLETE through `ENGINE_READ_S`;
- a rejoin's welcome into a standing result, an abandon, and a score's clock.

It records every HUD call (the timer figures, the posted lines, the round screens, the banners, the score rows) and, at
each step, `nextRoundIn`, `screenUp`, `hostageMarks`, `status`, `prompt` and `waitingRoom`.

`performance.now` is mocked as the test's stepped time plus a thousandth of a millisecond a call, so a read added to or
taken from the live path moves every figure after it. The SHA-256 of the record was computed on the base commit's
`netPage.ts` (`7397c20ed`, before the change): `0dc8bbe8fbc0d6b89ff6c8d82c46d91a82f04b83c5f92412aded48c3f5d2a4dd`. The
test asserts it, and it holds after the change. The existing netPage tests (`netPageConnect`, `netPageGame`,
`netPageJoin`, `netPageRound`, `netPageRoundAudio`) are unchanged and pass.

### The hunk (condition 3)

`netPage.ts` changes in four ways only:
- the optional dep, `replayClock()` (the dep, else the client's `pageClock`) and `now()`;
- the eleven time reads above, from `performance.now()` to `this.now()`, with the two comments that named
  `performance.now()` ms;
- the welcome's `launchAt` clear, kept in the replay mode when the welcome carries a countdown;
- the replay mode's block in the welcome (`hostageSaid`, the stopped figure).

Nothing else in the file moves.

### `ReplayClient` and the segment HTTP (W38.R1)

- **`ReplayClient`**: additive. New methods `pageNow(now?)`, `stoppedFigure()` and `pageClock()`. No signature changes,
  and nothing it tells changes. A `NetPage` whose client is a `ReplayClient` (`agent/modern-ui`'s too) runs its timers
  on the replay's clock with no change of its own: it reads `pageClock()` off the client.
- **`replay/mount.ts`** and **`main.ts`**: unchanged.
- **`fold.ts`** (internal, listed for completeness): `FoldState` gains `figure` and `launchEnds`; new exports
  `foldedFigure` and `PAGE_FIGURE_DEFAULT_S`.
- **`NetPageDeps`**: the optional `replayClock`.
- **The segment HTTP**: unchanged.

### Evidence

Unit tests only (node and jsdom). No browser, game, dev server or match server was run.
- `netPageClock.test.ts` (8 tests):
  - the live digest, and the sequence's determinism;
  - paused, the round timer stands still; at 4x it runs at 4x, and at 0.25x at a quarter -- with the clock read off
    the client, as the test room builds the page, and through the dep;
  - the client's clock: one object a replay, 0 before the recording opens, then the replay's tick over its rate;
  - the round screens follow the replay's clock: no screen while paused before the engine's read; at 2x, ROUND
    COMPLETE at its replay-time age;
  - a seek into a stopped period keeps the figure: 0 after time expired; the 80 s a round stopped on, from a later round
    and back from a running one; and the page's first figure before round 1;
  - a seek into the countdown posts its line once, and none on a seek within it or after playing its start, with the
    countdown's figure on the replay's clock;
  - a backward seek across a rescue restores the hostage's compass mark.

These pass unchanged:
- the other replay files: `replayClient`, `replaySeekFold`, `replayFold`, `replayFoldResidue`, `replayHostages`,
  `replaySpectate`, `replayEmbed`, `replayTimeline`, `replayLoad`, `replayClock`, `replayMode`. Those that build a
  `NetPage` on a `ReplayClient` now run it on the replay's clock, read off the client, and still pass;
- the netPage files;
- the tests that build a `NetPage`, `parityExemptions` among them (it pins the replay branch's construction, which
  is unchanged).

~~Not seen rendered: the timer, the countdown and the screens on a replayed page are RE-5's.~~ The timer was seen at
RE-5 (§7.3: at each target, and standing while paused); the countdown and the round screens were not reached by its
recording and stay unseen.

### 4.1 Placeholders

No `*_PLACEHOLDER` and no `*_READING`. `PAGE_FIGURE_DEFAULT_S` is the page's own first figure, a browser adaptation's
value equal to the HUD's (`DEFAULT_MODEL.timer`): not a game value and not an unknown.

One edge, named and not settled here: the fold's `roundSeconds` starts at 0 (PTT-6's), the page's at 6 x 60. A
countdown called off gives the fold's `roundSeconds` when it is above 0, else `PAGE_FIGURE_DEFAULT_S`, which is the
page's figure in every case the room makes (a `roundStart` or `roundTime` names a length above 0). PTT-6's own
`roundTime` rule before any `roundStart` (a respawn room's first round) still adjusts from the fold's 0 where the page
adjusts from 6 x 60. That is the fold's clock, not the figure, and is left as it is.

## 5. The air on a seek (RE-4)

Written 2026-10-10 for RE-4 of web sprint 38 (research 244 §7.2's projectiles item; §1's "the page's copies from
play"). **No parity finding**: a seek is the replay's adaptation (REPLAY_ADAPTATION; PT.R3), and the clear is the page's own
round-start clear, unchanged. The evidence is unit tests only (jsdom). No browser, game, dev server or match server was
run.

**The rule.** At a seek, before anything of the target is told, the page's air at the old playhead is cleared. The
welcome then lays the target's charges (§1, the envelope's `projectiles`), so after a seek the page holds the target's
charges alone. What is cleared is what the page's `GrenadeThrower.clearAir` drops (`grenade.ts` :763, its doc
:757-762), the clear a round's start and an abandon already run on the page (`armoryGlue.ts` :29-30; the room's own
`Room.clearAir`, `room.ts` :3553-3558, called at `startRound` :4630 and `abandon` :1797;
ROUND_START_PROJECTILES_READING):
- every grenade, launched round and rocket in flight, the others' copies and the page's own (a watcher has none);
- every charge set down (a claymore, C4, a PMN) the page holds from play, at rest or detonated.

So `clearAir` drops everything in the air and on the ground, and the welcome lays again the charges that are still
there at the target. The two cases §1 left are closed: a seek back before a charge's placement, and a seek past a
set-off whose blast lay in the skipped span. A grenade in flight at the target is still not folded (§1, owed): after a
seek the page draws none until play reaches the next throw.

**Silent.** `clearAir` only takes the models, the arcs and the trails off the scene (`dropLive`, `grenade.ts`
:1632-1636). It emits no `explode`, `bounce` or `remoteRelease`, plays no blast, sound or effect, and lays no scorch.
A charge removed by the clear is never set off. The welcome's hydrate of a charge runs no release either (§1).

**Not cleared** (a round's start, unlike a seek, has stopped the effects playing since 2026-11-09: research 283 §9):
- the effects already playing (a blast's particles, an AN-M8's smoke already pouring) and the scorches. They are the
  page's effects and its `clearScorches`, not the air (`grenade.ts` :757-762, `clearAir`'s own doc). A smoke pouring
  at the old playhead keeps pouring after the seek, and the target's own smoke is not folded (§1, owed). It is owed
  with the folding of smokes; no value is guessed for it;
- the world drops. The page's round hooks reset them with the air (`main.ts` :347, PF-34). A seek needs no clear of its
  own for them: the welcome's envelope replaces the page's drops whole (`NetPage.joinSinks` `drops` ->
  `WorldDrops.replaceAll`, `netPage.ts` :1169), and `drop` / `taken` are stateful, so a page holding a drop from play is
  told a welcome at every seek (PTT-6's gate, `firstStateful`).

(2026-10-11: the smoke and the scorches on a seek since RV-7 -- research 276 §6.)

### The hook: the match part, not `main.ts`

- **The client tells the seek.** `ReplayClient.onSeek(listener)` (`replayClient.ts` :352) adds a listener, and
  `seekTo` calls each at its start (:359), before the roster's diff, the world and the welcome. Every seek reaches it:
  `seek`, `seekStart` (Home), `seekEnd`, a step back, the embedder's and the timeline's seek, and `tick=` on the open.
  Play and a step on are not seeks, and call nothing. (Since RV-2, research 276 §1: the clock is moved first and the
  listener is handed the seek, `{ from, to, folded }`; still before anything of the target.)
- **The match part hears it.** `mountActions` (`matchActions.ts` :133-146, `followSeek`) already follows the page's
  client for the room's events (`follow`, and `followNet` every frame after `net.frame`: `main.ts` :1547,
  `matchMount.ts` :734). With each client it follows, it now also takes that client's `onSeek` when it has one, read
  off the client as `NetPage` reads `dtScale` and `pageClock` (§4), and calls its `grenade` dep's `clearAir` there
  (:332, :336). The previous client's listener is let go when another (or none) is followed, and at `dispose` (:343).
- **Both pages hand the `GrenadeThrower` itself** as `grenade` (`main.ts`'s `mountActions({ ... grenade, ... })`,
  `matchMount.ts`'s `grenade: throws.grenade`, pinned by `matchActions.test.ts`'s shape test), so its `clearAir`
  reaches the part with no change to either. `MatchActionsDeps.grenade` gains `clearAir?(): void`, optional: a page
  that does not hand it clears nothing.
- **`main.ts`, `matchMount.ts`, `netPage.ts`, `armoryGlue.ts` and `replay/mount.ts` are unchanged.** No `main.ts`
  window was needed or asked for.

**The live path.** A live `NetClient` has no `onSeek` (held by the test), so the part takes no listener for it, and the
live page clears the air only at its round hooks (`armoryGlue.ts` :29-30, unchanged). The test room's live and offline
branches call `acts.follow(net.client)` as before; it now also looks for `onSeek` on that client, finds none, and does
nothing else.

### `ReplayClient` and the segment HTTP (W38.R1)

- **`ReplayClient.onSeek(listener: () => void): () => void`**: new, so additive. Told at each seek before the target;
  returns the listener's removal. A page whose action part follows a `ReplayClient` and was handed its
  `GrenadeThrower` (`agent/modern-ui`'s too, through `matchMount.ts`) clears the air at a seek with no change of its
  own.
- **What a seek tells**: unchanged.
- **`MatchActionsDeps.grenade`** (not the engine's surface, listed for `agent/modern-ui`): the optional `clearAir`.
- **The segment HTTP**: unchanged.

### Evidence

Unit tests only. `replayAir.test.ts` (9 tests, jsdom) drives a watcher's `NetPage` on a `ReplayClient`, its
projectiles flown by a real `GrenadeThrower` through the throwables part's own hooks (`matchThrow.ts` `netDeps`), and
the action part following the page's client every frame:
- a seek back across a throw draws no grenade from the old playhead, and nothing is heard or set off;
- a step back clears the air, a step on does not;
- a seek back before a claymore's placement, and a seek forward past its removal (its `detonate` in the skipped span),
  leave no stale charge, with no blast;
- a claymore placed and still there at the target is laid again by the welcome, once, at rest, while the M67 in the
  air at the old playhead is gone;
- a replay played on with no seek never clears; a part that has let the replay's client go is not cleared by its seek;
- the live path: `NetClient` has no `onSeek`; a live client followed through frames and its round events never calls
  the seek's clear, and the round hooks' `newRound` and `abandoned` still clear the air.

RE-1's `replayFoldResidue`, PTT-6's `replaySeekFold`, RE-3's `netPageClock`, and `replayClient`, `replayMode`,
`replayHostages`, `matchActions`, `matchMount`, `armoryGlue`, the grenade files and `parityExemptions` pass unchanged.

~~Not seen rendered: the air on a replayed page after a seek is RE-5's.~~ (seen at RE-5, §7.3)

### 5.1 Placeholders

None: no `*_PLACEHOLDER` and no `*_READING`. The clear is the page's `clearAir` under its existing
ROUND_START_PROJECTILES_READING (research 95 §8); the seek's hook is the adaptation's own and names no game value.

## 6. The operator's `/replays` gains `orphans` (RE-8)

RE-8 (web sprint 38) is the server's records: research 245 §7 holds the work, its choices and its tests. This section
is only its W38.R1 entry, so that `agent/modern-ui` (MU.R9) can follow the one change to the segment HTTP.

### `ReplayClient` and the segment HTTP (W38.R1)

- **`GET /replays`, the operator's answer only** (`Authorization: Bearer <METRICS_TOKEN>`): one new key beside
  `replays`, `orphans`, always present for the operator (an empty array when there are none). Each entry is
  `{ id, file, bytes, modifiedAt }`:
  - `id`: the 16 lower-case hex digits its path would carry (`replayId`), as a sidecar's;
  - `file`: its path relative to `REPLAYS_DIR` (`<room dir>/<name>.s2r`), never absolute;
  - `bytes`: its size;
  - `modifiedAt`: its mtime, ISO 8601.

  An orphan is a closed `.s2r` whose sidecar was never written. The entries come newest first by `modifiedAt`; `limit`
  caps them as it caps `replays`, and `room=` keeps those in that room's directory.
- **Additive**: `replays` and its seven fields are unchanged. A participant's or anyone else's answer is unchanged:
  `{ replays }` only, never an `orphans` key.
- **Unchanged**: `GET /replays/<id>` (an orphan is not served), `/segments` and `/segments/<n>.s2r`, and
  `ReplayClient`.

## 7. The seek seen whole (RE-5)

Written 2026-10-10 for RE-5 of web sprint 38 (the plan's `### RE-5`; research 244 §7.2-§7.3's "not seen rendered"
list). **No parity finding**: the replay, its fold and the playtest session are the adaptation's
(`REPLAY_ADAPTATION`; PT.R3), and the dev hook's new read is a playtest instrument with no original. The spec plays the
game only to make a recording of it.

### The dev hook's read: `devSeen()`

`packages/viewer/src/devSeen.ts`, hung on the hook by `main.ts` (one line, beside `teleport`) and declared optional in
`hook.ts`. Read only, never a write:
- **the bomb** as the page's `BombPage` holds it: `BombPage.state()`, a copy;
- **the world bomb's drawn model**: the `Satchel` that `GrenadeThrower.worldBomb` places (`BOMB_MODEL_READING`): where
  it stands and whether it is shown, or null before its first placing;
- **each drawn body**, from `RemotePlayers`:
  - its life (the last snapshot it was drawn from);
  - the clip its `Play` plays, and the clip's key;
  - its death clip and the seconds since the death (`hydrateCorpse`'s corpse at its age);
  - the gear asked (`RemotePlayers.setGearVisible`'s, kept by id) and each fitting's node as drawn (the carrier's
    `Satchel`);
- **the ghosts** (`markGhost`);
- **the HUD's drawn quads**: the geometry the HUD pass filled on its last frame, keyed by `layer:bitmap` and read off the
  HUD's own scene (`Hud.warmTarget`), with each quad's centre in drawing-buffer pixels. This is what was drawn, not the
  model it was drawn from. It is empty while the HUD is not drawn, because `Hud.render` returns before the draw.

`RemotePlayers` keeps no public read of its bodies or ghosts, and `GrenadeThrower` none of its bomb model. So the read
takes their own fields (`remotes`, `ghosts`, `gearShown`, `bombModel`), cast in the instrument module. This keeps two hot files
(`remotePlayers.ts`, `grenade.ts`; COLLABORATION, "the hot files") untouched. The unit test holds those field names to
the sources, so a rename fails in vitest, not in a browser.

**A development build's only, as the keyboard is (OT.R29).** `main.ts` spreads it into the hook under a literal
`import.meta.env.DEV`, which every `vite build` folds to false. The read and its module are then unused and dropped.
`packages/viewer/test/devSeen.test.ts` holds this the way `build_keyboard.test.ts` holds the keyboard:
- the source form of the `main.ts` line, and the optional hook member;
- in this (development) run, that the read exists and carries `DEV_SEEN_MARKER`;
- that what it reads is real: a real `GrenadeThrower`'s world bomb, a real `RemotePlayers`' ghosts, and a real `Hud`'s
  drawn ret_bomb quad on the compass (none while hidden);
- on a build of this tree (`builtDist`'s guard), that `dist/viewer/assets/*.js` holds neither the marker nor the name
  `devSeen`. Without a build of this tree it is a skip that names why, never a pass.

`main.ts` is a hot file (COLLABORATION). The change is one import and one spread line, both additive. The plan's RE-5
row named only `hook.ts`, but a hook read is assigned where the hook is built: `BombPage` lives in `acts.bomb`, and only
`main.ts` holds it beside `remote`, `grenade` and `hud`.

### The spec: `packages/viewer/e2e/replayEngine.spec.ts`

PTT-7's form (244 §7.3): one session, recorded by one offline page through the `SessionService` in the test's process
on `playtestPort()`, the pages on the e2e's own Vite.

**What it records:**
- **segment 0, Crossroads (MP72)**, with the developer's kit `62,15,121,153,255` (`equipment.spec.ts`'s: M67 and
  Claymore). In order:
  - mark A, with the bomb on the ground;
  - a manual turret mounted with X (`mp72_turret01`, research 215 s3), mark T, then dismounted;
  - a claymore placed, mark K1; set off by the Detonator from 300 units off (past its 250-unit blast, within the
    Detonator's 500), mark K2;
  - the bomb picked up on StartBomb and carried away (PTT-7's walk), mark B;
  - an M67 tossed at the feet (`grenadeSelfMp.spec.ts`'s weakest lob), its blast, mark D;
- **segment 1, Desert Glory (MP6)**, EXTRACTION with the offline room's three hostages (HX-1). Mark H0; one hostage shot
  dead, mark H1. The killer pays 2 (`room.ts` `on('killed')`), so the scoreboard moves.

**What it asserts, in the report's embedded replay, paused, each target reached by a mark's button:**

| case | at the target | the source of the expectation |
|---|---|---|
| live, while recording | the HUD's drawn nav marks sit about the drawn compass ring at the model's bearings; the bomb's ret_bomb quad likewise (a plain assertion since the lane's merge of main b155834d6; it found the defect below) | `compassMarks`' bearing rule, restated |
| 1 | the scoreboard (`hud().model.scoreRows`) and the round timer at A, T, K1, B and D; paused, the timer stands still | the recording's last `score` at or before the target; the fold's clock rule restated (`clockAt`) |
| 2 | at B, `BombPage.state()` is carried by the player, no world bomb is drawn, and the carrier's remote body has its Satchel asked and drawn; at A, the bomb lies at its recorded place with the world bomb drawn there and no Satchel; twice round | the recorded `bomb` events |
| 3 | the turret's occupant is the player at T; none at A; again at T | the recorded `turret` event |
| 4 | one claymore at rest at K1, owned by the player, at its recorded place; none at K2 or A; one (not two) at K1 again; no blast replayed by a seek | the recorded `grenade` (placement) and the Detonator's `grenade` (the room broadcasts no `detonate` for a Detonator's set-off, §1's table) |
| 5 | played from B until the frag is in the air, paused, then sought to B: nothing in the air or on the ground, and no blast; at D, if the frag killed the player, the player's body at its death clip and age | the recorded `grenade` and `kill` |
| 6 | reopened into segment 1 at H0: the three hostages alive, three ret_hostage marks at the roster's places, the scoreboard; at H1, the shot hostage dead, its mark gone, its body at the kill's clip and its age, the scoreboard after the kill (and different); back at H0, all as before and the body alive | the `hostages` record, the hostage's `kill`, the `score`s |

### 7.1 Placeholders

Test thresholds of the e2e, none a game value. They are outside the ledger's walk (`packages/<name>/src` and
`tools/`), so each row is *note only*, as 244 §7.4's are. `START_BOMB`, the bomb's state numbers, `HOSTAGE_ID_BASE`,
the kit and `TURRET_BEHIND` are restated from `crossroads.spec.ts`, `net/objective.ts`, `match/src/extraction.ts`,
`equipment.spec.ts` and `turretMount.spec.ts` (not new).

| name | value | where | status |
|---|---|---|---|
| `ENGINE_CARRIED_AWAY_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 30 units, horizontally | `packages/viewer/e2e/replayEngine.spec.ts` | a chosen threshold, PTT-7's `PATHS_CARRIED_AWAY_PLACEHOLDER` restated: past the pickup's 20-unit reach |
| `ENGINE_TIMER_TOLERANCE_S_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 0.05 s | `packages/viewer/e2e/replayEngine.spec.ts` | a chosen tolerance: the page's timer, paused at a target, against the recording's clock there; only float rounding separates them |
| `ENGINE_CORPSE_AGE_TOLERANCE_S_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 0.1 s | `packages/viewer/e2e/replayEngine.spec.ts` | a chosen tolerance: a corpse's age on the page against the target's tick less the kill's; paused, frames add nothing |
| `ENGINE_PLACE_TOLERANCE_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 1 unit | `packages/viewer/e2e/replayEngine.spec.ts` | a chosen tolerance: a charge's, the world bomb's and a hostage mark's place against the recorded one |
| `ENGINE_BEARING_TOLERANCE_DEG_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 2 degrees | `packages/viewer/e2e/replayEngine.spec.ts` | a chosen tolerance: the drawn ret_bomb quad's bearing about the drawn ring's centre against the model's |
| `ENGINE_HOSTAGE_RANGES_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 25, 40, 60 units, nearest first | `packages/viewer/e2e/replayEngine.spec.ts` | chosen distances: where the shooter is stood from the hostage it shoots (MP6's hostages stand in a cell; from 60 the first runs' rounds went over the body) |
| `ENGINE_PAUSE_TRIES_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 3 | `packages/viewer/e2e/replayEngine.spec.ts` | a chosen count: how many times case 5 plays from B to pause with the frag still in the air before it fails (paused 1-4 ticks after the throw in every green run; the fuse is 3 s) |
| `ENGINE_CLEAR_OF_BLAST_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 20 units | `packages/viewer/e2e/replayEngine.spec.ts` | a chosen margin past the claymore's 250-unit explosion radius where its placer stands to set it off (stood on it, the placer died in run 5) |

The read itself names no value: `DEV_SEEN_MARKER` is a scan marker, not a game value or an unknown.

### 7.2 Not seen, settled as `fixme` with the reason

**A defect seen rendered, not RE-5's to fix: the bomb's compass mark is never drawn.** On the live page, walking, the
HUD's model holds the bomb's mark (`BombPage.hudFrame` -> `setExtraMarks`), but `devSeen().hud` shows no `ret_bomb.tif`
quad, while the nav marks beside it are drawn at the model's bearing (0.00 degrees off): `ret_bomb.tif` and
`ret_base.tif` are not among the bitmaps this lane's `hudAssets.ts` loads (`HUD_LIBRARIES.HUD2`), and the HUD pass
skips a mark whose bitmap has no size (seen in every run that reached mark A, 2026-10-10; §7.3). This is an independent rendered
confirmation of the defect PR #130 (`eed6708f9`) fixes by reading both from HUD2 (research 239); the spec holds it as
an expected failure (`test.fail`) until the lane merges main, when it becomes a plain assertion. (Flipped at the lane's merge of main b155834d6, 2026-10-10: a plain assertion now, first run at the sprint's close gate.)

- **A rescued hostage's mark across a backward seek** (RE-3's `hostageSaid`). No recording can hold a rescue as built:
  a rescue needs a hostage led into the zone (`ExtractionAuthority` `rescueTest`, `inZone`), and a following hostage
  holds its point (`hostageAi.ts` `FOLLOW_MOTION_PLACEHOLDER`; HX-4b owes the motion). So no hostage reaches the zone in
  any room. The clear is held by `netPageClock.test.ts` (unit). Case 6 sees the same roster survive a backward seek past
  a kill instead.
- **A running victory dance at its age** (RE-1). The room offers a dance only at an enemy corpse within 30 units
  (`room.ts` `victoryStatus`), and the offline room seats one player, so no offline recording holds one. A dance needs a
  two-seat recording, a match server's (`RoomRecording`) opened as a local file. It is held by
  `replayFoldResidue.test.ts` (unit), and §1's "the page's limit (owed)" still stands.
- **The HUD's drawn compass on a replay after a seek.** A replay's watcher does not walk, so the page draws no HUD for
  it: `main.ts` calls `hud.setVisible(walking)`, and `devSeen().hud` reads `visible: false` with no quad. The compass
  after a seek exists only as the HUD's model, which cases 2 and 6 read, as does `replayPaths.spec.ts` case 5. The drawn
  compass is checked against its model on the live page instead. Drawing the HUD for a replay's watcher would change
  what the page shows a spectator, which is not RE-5's to decide.
- **A player's blast death, drawn at its age: owed.** Case 5 holds only the corpse's bookkeeping at D: dead, drawn,
  the kill's death clip (null for a blast) and its age. The body is drawn at key 0 of `seal_landbackwards01` (§7.3), not
  at a pose of its age, and the recording cannot say otherwise. A blast's fall (its `knock`, `fallForward` /
  `fallBackwards` / `proneCover`) reaches its victim alone: `Room.blast` sends `blast` with `send`
  (`room.ts:4064-4067`), and only `Room.broadcast` hands an event to the recorder (`room.ts:5159-5163`). So no replay,
  and no joiner, is told which fall a blast's corpse lies in. It is settled by recording the fall (an additive `kill`
  field, or a broadcast of the knock), a room change no task asks for.
  *(2026-10-11, RV-6, research 276 §5: the premise does not hold -- every recorded snapshot carries the corpse's action and its clock; a seek now tells a landed blast corpse in its landing at its age; the key 0 was the page's animator.)*
- **The player's own death clip** (case 5, at D) is asserted only when the frag killed. The weakest lob may only hurt
  (`grenadeSelfMp.spec.ts`: "hurt (or killed)"), and a blast's kill names no clip ("a fall or a blast plays its own",
  `protocol.ts` `kill`). The death clip at its age is case 6's, the hostage's (a bullet's clip).

### 7.3 RE-5, rendered

**Evidence kind: a rendered browser run**, kept apart from the unit tests above. The runs used headless Chromium
153.0.8010.12 as Playwright reports it. The page's renderer reported the backend `webgl2`; Playwright named no GPU, and
the GL implementation under ANGLE was not read. One worker, Vite on 5306, the session service on 5308, Local 5307. The
host lock read FREE before the first run, and over 8 GB was free before each. The page was read through the dev hook,
`devSeen()` among its reads (dev-hook reads, named as such). The command, from `socomlegacy/`, with the disc's variables:

```
E2E_PORT=5306 E2E_LOCAL_PORT=5307 E2E_PLAYTEST_PORT=5308 npx playwright test packages/viewer/e2e/replayEngine.spec.ts --workers=1 --reporter=line
```

**The green runs** (on `agent/playtest-re5` above `38f1acacc`, with the phase-2 edits; each "9 passed, 3 skipped"):

| run | UTC | free before | result | time |
|---|---|---|---|---|
| 12 | 06:35-06:38 | 8.2 GB | 9 passed, 3 skipped | 2.5 min |
| 14 | 06:46-06:48 | 9.5 GB | 9 passed, 3 skipped | 2.1 min |
| 15 | 06:48-06:50 | 9.3 GB | 9 passed, 3 skipped | 2.1 min |
| 16 | 06:50-06:52 | 9.4 GB | 9 passed, 3 skipped | 1.9 min |

The 9 passed include the bomb mark's expected failure (`test.fail`, the defect above). The 3 skipped are the three
`fixme`s of §7.2. Run 12 had the spec without the clips refused and without the backend line (below); runs 14-16 had
the spec as committed. No page error was seen on the play page, the report or the replay. No server was left on
5303-5308 after the last run.

**The iterations before them** (runs 1-11 and 13, the spec as written by reading then corrected; each a failure, kept
here as such):
- **runs 1-2:** the bomb's drawn compass mark (the defect above). The nav marks' drawn check took its place, and the
  bomb mark became its own expected failure;
- **run 3:** the turret's prompt was read before the teleport had settled. A short wait fixed it;
- **runs 4-7** (`-g recording`):
  - the claymore killed its placer, stood on it (health 0 after the Detonator); the placer now stands 300 units off;
  - the rounds at the hostage went over it from 60 units: MP6's hostages stand in a cell. The shooter now stands 25,
    40 or 60 units off, nearest first;
- **run 8** (`-g recording`): passed;
- **run 9:** the closeout expected a `detonate` for the claymore. A Detonator's set-off records none, only the
  Detonator's `grenade` (§1's table), so the check now reads that;
- **run 10:** the replay frame in the report never came up within the test's five minutes;
- **run 11:** at B, the carrier's Satchel was drawn but the read's "gear asked" was empty. It read a remote body's
  `Play.shownGear`, where `RemotePlayers` keeps none; it now reads `RemotePlayers`' own `gearShown`, pinned by the unit
  test;
- **run 13:** the report's page never reached `load` within five minutes.

Runs 10 and 13 hung at the report's open, and run 12 did not. The report holds the eight marks' clips (`<video
preload="metadata">` from `/evidence/<id>/clip.webm`) on the session service's origin, the same origin the replay reads
its segments from. The suspected cause is the browser's per-host connection limit taken by the clips; it is **not
proven**. The spec now refuses those clip reads on the report page and waits on the report's DOM only, and keeps the
replay's iframe in view after each mark's click. The clips are not RE-5's subject, and the report page is unchanged. A
report with many clips may hang its own replay the same way for a person. The cause is **unproven**, and it is **owed to
the playtest report** (`packages/playtest/src/report/page.ts`; the merge controller files it as a LATER row at the
merge), not settled here.
*(2026-10-11, RV-11, research 276 §4: measured without a browser -- the clip route ignored `Range`, and clips asked whole and left unread held a six-connection pool against a segment read; fixed by `preload="none"` and single-range answers; still unproven for Chromium, the rendered check owed to the controller's browser window.)*

**What was seen, beyond the assertions** (runs 12 and 14-16):
- **the clock:** every seek's round timer equalled the recording's clock to the thousandth of a second (for example
  349.150 against 349.150 at A in run 12), and paused it stood;
- **the scoreboard:** the frag's suicide moved the player's row to deaths 1, score -2 at D, and the hostage's kill to
  score -2 at H1. Segment 1's restore (H1 back to H0) is asserted in those runs. Segment 0's (D back to B) is asserted
  since the review's round (finding 5), **verified at the close gate**;
- **the turret:** at T, `[{id 1, occupant 1}]`; at A the page held no turret entry;
- **the claymore:** at K1, `{state 'rest', owner 1, pid 0}` at its recorded place;
- **the frag:** the replay was paused 1-4 ticks after the throw, with the frag in flight, and the seek to B left
  nothing. The frag in the air at the pause was only logged in these runs. It is asserted since the review's round
  (finding 2: a late pause is played again from B, never accepted), **verified at the close gate**;
- **the player's own corpse at D:** its age matched the recording (1.75-2.47 s). That it is drawn (`visible`) is
  asserted since the review's round (finding 4), as is the hostage's at H1, **verified at the close gate**. Its death
  clip is null, a blast's, and the body drew `seal_landbackwards01` at key 0 rather than a pose at its age: a blast's
  fall is told to its victim alone (`blast`, not recorded; owed, §7.2). Recorded, not asserted;
  *(2026-10-11, RV-6, research 276 §5: the premise does not hold -- every recorded snapshot carries the corpse's action and its clock; a seek now tells a landed blast corpse in its landing at its age; the key 0 was the page's animator.)*
- **the hostage's corpse at H1:** `death_crouch_chest02` at its age (2.4 s against 2.4 s);
- **the extraction zone's mark** was in the HUD model's marks at H1 (the spec filters to `ret_hostage` at H0). Not
  asserted;
- **the drawn compass:** `ret_nav_02` was drawn at the model's bearing, 0.00 degrees off, in every run. The `ret_bomb`
  quad was never drawn.

**Struck from the "not seen rendered" lists:**
- 244 §7.2-§7.3 (the scoreboard, the round's clock, a death clip at its age, the turrets, the world bomb and the
  carrier's Satchel, the hostages' marks, a placed charge, the air on a seek);
- this note's §1 (a placed charge; a running dance stays unseen, §7.2);
- §3 (the compass marks after a seek);
- §4 (the timer on a replayed page; the countdown and the round screens were not reached by this recording and stay
  unseen);
- §5 (the air after a seek).

### `ReplayClient` and the segment HTTP (W38.R1)

Unchanged. RE-5 adds only a development build's hook read and a spec.
