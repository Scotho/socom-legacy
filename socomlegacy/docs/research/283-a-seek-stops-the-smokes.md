# 283 -- A seek stops the smokes pouring: `clearSmokes()` (PAR-45)

- Date: 2026-10-11. PARITY-2's row PAR-45 ([brief](../plans/briefs/2026-10-11-par45-clear-smokes.md)), the playtest
  lane's RV-7b. Base `d8bfafffe` on `agent/par45`.
- Builds on the playtest lane's reading, research 276 §6, "Not cleared, not laid" (the branch reading:
  `origin/agent/playtest@3673c7e29`, the web project's `docs/research/276-the-replay-viewer-to-release.md`; §6 is the
  same there as at `fc35c2752`). That note is not on `main` yet; every claim taken from it was re-read here in the code.
- A **browser adaptation** for the replay's seek (`REPLAY_ADAPTATION`, research 240 §3; PT.R3): nothing here changes what
  an ordinary match draws, plays or decides. `clearSmokes()` is called by no page yet (RV-7c's, below).
- Status: **reading, pending review**. The code was read at the base's lines (cited below as they were there; the
  change moves some). The decompilation (`$SOCOM_PC_ROOT/game/analysis/socom2_game.elf.decomp.c`, cited `FUN_<addr>`
  and `D:L<line>`) was read at the lines cited for the particles' question only. The disc's effect programs were listed
  off the fixtures (`test-fixtures/RUN/MP2.ZDB`, `MP6.ZDB`, `MP72.ZDB` through `effectsFromDisc`) by a throwaway test
  outside the commit. Nothing was measured running: no browser, game, dev server or match server was run.
- The code: `packages/viewer/src/effects.ts` (`RunContext.parent`, `Effects.run`'s `stop()`, `stopCalled`, `begin`'s
  `call`), `packages/viewer/src/grenade.ts` (`setEffectPlayer`, `clearSmokes`, `smokeRuns`, `keepSmokeRun`,
  `Live.effectSmoke`, `CLEAR_SMOKES_PUFFS_READING`), `packages/viewer/src/matchThrow.ts` (the effect door). The tests:
  `packages/viewer/test/effects.test.ts` ("PAR-45: a handle's stop() ..."), `grenade.test.ts` ("PAR-45: clearSmokes()
  ...", and the real effects player's PAR-45 case), `matchThrow.test.ts` (the door's case).

## 1. The read: 276 §6's claims at the code

Every claim of the brief and of 276 §6 holds; only line numbers moved since 276 was written.

- **The effects player** (`effects.ts` at the base): `EffectHandle` :112-119; `RunContext` :146-151; `play` is `run`
  answered yes or no (:329-331), `run` (:334-339) hands `{ alive, finished, stop }` over one `EffectRun`; `begin`'s
  `case 'call'` (:680-683) starts the called program with `this.start(program, ctx.place)` and keeps nothing of it --
  the child is a run of its own with no link back; a `PARTICLE_SOURCE` emits while its run lives (`particles.emit`'s
  `() => !run.finished`, :736); `reset` (:496-509) stops every run, the ambient ones with them, and empties the
  particles -- a new map's.
- **How a run stops and finishes** (`effectRunner.ts`): `EffectRun.stop()` (:113-115) sets `failed`; `finished`
  (:108-110) is `failed`, or every sequence done while not paused; `update` (:123-127) does nothing once finished; a
  `FAIL` op stops the run itself (:202). `Effects.update` drops the finished runs from its list each frame (:480-491;
  :486) and takes their instances off the scene. A stopped run's particle sources die at the particles' next frame
  (`particles.ts` :168, `if (!s.alive()) sources.delete`), and their particles live on to their lifetimes (:184).
- **The grenade page** (`grenade.ts` at the base): `setEffectPlayer` :1659 (a door answering yes or no); `Live.effectSmoke`
  :403, set at :1493 (a joiner's `JOIN_SMOKE_STREAM`, `hydrateLive`) and :1694 (an observer's `smoke_grenade`, `explode`);
  `launchRemote` :1373, its guard against a second stream :1384-1398 (`smoked` from the old copy's `effectSmoke`, the
  old puffs dropped by pid); the placeholder puffs `smokes` :1702, drawn by `smokeFrame` :1724; `clearAir` :778-782
  (drops the air, strips the smokes' pids: nothing that pours stops); `clearScorches` :762-769.
- **The door's callers**: `matchThrow.ts` :263 (`effects.play`; 276 cites it at :250) and :489 (`setEffectPlayer(null)`
  at the part's dispose); `roundStart` :478 (`clearAir`, `clearScorches`, the wash); the tests `grenade.test.ts` 269
  (`false`), 278 (`true`), 523 (`true`), 568 (the real `Effects.play`) and `warmSet.test.ts` 67 (`true`).

## 2. The three questions

**Does the particle system keep the puffs a stopped run has already emitted, and does the original's smoke vanish or
fade when its owner goes?** The page's keeps them: a source whose run is stopped stops emitting and is dropped, and its
particles run out their lifetimes (`particles.ts` :168, :184; research 89 §3, "until the events allowed are spent or the
animation ends ... It dies at its lifetime"). The original's answer is not settled by this read:

- the original frees a source's live particles with the source: `FUN_0032a6b0` (D:L227162) unlinks the source from the
  manager's list and calls `FUN_00327f70(0x488480, source)` (D:L227179), which walks the live particle list and frees
  every particle whose owner is that source (D:L225737-225758);
- an animation's sources are freed through `FUN_0032a6b0` by `FUN_0026fe90` (D:L118483-118504), by `FUN_0026d560`'s loop
  (D:L117003-117012) and by a branch of `FUN_00270570` (D:L118805-118816), which first tests each source's bytes at
  +0 and +300 (D:L118752-118765) -- read in part; whether a stopped or ended animation reaches a free at once, or only
  once its particles are spent, is not read.

So the puffs already in the air are **kept** (they run out), the page's existing behaviour, named
`CLEAR_SMOKES_PUFFS_READING` (§7). If the original frees an ended animation's sources at once, its smoke vanishes when its
stream ends rather than thinning; that would be a finding against `particles.ts` itself, not only against this clear.

**Does anything else depend on `call`'s child being unlinked?** No:

- the only holder of a handle before this change is the traversal's ripple keeper (`traversalPage.ts` :241, :260,
  :267: `Effects.spawn`, which is `run`), and no ripple program calls one (on MP2, MP6 and MP72 all six of
  `RIPPLES`' programs have no `call`). The check covered those three maps only (the fixtures); the programs are per map,
  so a water map whose ripple program calls a child would now have that child stopped with the ripple keeper's
  `stop()` -- a dev-disc pass over every map's ZDB is owed (the review's L1);
- the link is read by the handle's `stop()` alone: `EffectRun.stop` (a `FAIL`), `STOP_ANIMATION` and
  `PAUSE_ANIMATION` (by name, `effects.ts` :760-769), `Effects.update`, `reset` and `stats` are unchanged;
- a particle source stays keyed by its own run (`particles.emit`'s owner id), as before.

**Are any `call` chains ambient?** Yes: on MP2 the ambient `firey_flames` calls fifteen (`firelighton4`-`6`,
`ventlighton1`-`6`, `ventlightoff1`-`6`), on MP6 `mp6_battlesounds` calls `testexplode` and `testtrail`; MP72 has no
ambient effect (the fixtures' programs, listed by the throwaway test). No handle reaches an ambient run (`setData`
starts them, :255, and keeps them in `ambientRuns`), so this change stops none of them; `Effects.reset` stays a new
map's, unchanged. The link is held on the child (`RunContext.parent`), not as a list on the caller, so an endless
caller like `firey_flames` keeps no list that grows.

An aside, not changed here: a called child is started with `ambient` false (`begin`'s `call`, :682), so the children of
an ambient effect play their looping (`~`) sounds through the page's sound door, which the ambient run itself leaves to
the audio's emitters (`RunContext.ambient`, :149). Whether that doubles a sound on MP2 or MP6 is unread.

## 3. What changed

- **`effects.ts`**: a `call` starts its child with the caller recorded (`RunContext.parent`). A handle's `stop()`
  (`run`, now `stopCalled`) stops its run and every run in the list whose chain of callers reaches it, so a stop reaches
  the children, the grandchildren and so on, even after the caller itself has ended (as `smoke_grenade` ends before its
  `smoke_stream`). `alive()` and `finished` are still the run's own. The particles are untouched (§2). A child holds its
  callers while it lives; the call graphs of MP2, MP6 and MP72 hold no cycle (145, 170 and 147 programs that call), so
  a chain is no deeper than its graph.
- **`grenade.ts`**:
  - `setEffectPlayer` takes a door answering `EffectHandle | boolean | null`, read for its truth as `play`'s yes or no
    was; `true` and `false` still work (the tests' doors), and a `true` gives no handle to stop.
  - Where a smoke's `effectSmoke` is set (`explode`, `hydrateLive`) the handle, when there is one, joins a private list
    (`smokeRuns`).
  - `Live.effectSmoke` is now set to `false` for the placeholder puffs as well as `true` for the effects' run, and is
    absent while nothing pours for the projectile. The rejoin's guard reads it the same way: `smoked` is
    `{ effect: old.effectSmoke }` when it is set (before: `old.effectSmoke === true`, its absence counting as the puffs).
  - `clearSmokes()` stops every listed handle, empties the list, empties `smokes` (the placeholder's sources), and drops
    each live projectile's `effectSmoke`, so a hydrate after it starts the stream again rather than counting on one it
    stopped.
  - `reset` and `clearAir` are unchanged: a seek runs `clearAir` first (276 §6), and nothing else needs a seek-only path.
- **`matchThrow.ts` :263** (was `effects.play`): the door hands `effects.run`'s handle. `run` is non-null exactly when
  `play` was true (`play` is `run(...) !== null`), so every truth read is the same. The bounce's sound fallback is
  unchanged.

## 4. What `clearSmokes()` stops, and what it leaves

It stops:

- an observer's smoke: the `smoke_grenade` run and, through the handle, the `smoke_stream` run it called (emission
  ends with them);
- a joiner's smoke: the `JOIN_SMOKE_STREAM` run;
- the placeholder puffs' sources (`smokes`), an observer's and a joiner's, on a map whose archives lack the program.

It leaves:

- the puffs already in the air, the effects player's and the placeholder's sprites alike, to run out their lifetimes
  (`CLEAR_SMOKES_PUFFS_READING`);
- the canister and every projectile in the air (`clearAir`'s), the scorches (`clearScorches`'), the pouch and the hand;
- every other effect: the ambient effects, a blast's or a flash's run (their handles are not kept), the ripples;
- a smoke whose door answered a bare `true` (a test's door: no handle to stop).

An ordinary match never calls it, so a match's smoke pours as before, run for run and puff for puff (held against
`Effects.play`'s door on the game's data, §6).

## 5. Not done, and owed

- **The seek's call** (`MatchActionsDeps.grenade.clearSmokes?()` and its call in `followSeek`, beside
  `clearScorches`), and then **the hull's wiring** (`ReplayClientOptions.hull`): the playtest lane's RV-7c, out of this
  brief. Until then the double smoke of 276 §6 ("A seek inside a smoke's life draws it twice") holds.
- **The original's answer to the particles' question** (§2): `FUN_00270570`'s free, read whole, or a capture of a
  smoke at its stream's end.
- **PAR-46**, the grenade's own flight hull off the walk: not this row's.

## 6. Evidence

Unit tests only (node and jsdom), one file at a time. No browser, game, dev server or match server was run.

- `packages/viewer/test/effects.test.ts`, "PAR-45: a handle's stop() stops what its run called, recursively" (3 tests,
  synthetic programs): a waiting parent's stop leaves neither it, its child nor its grandchild alive; a parent already
  ended still stops its child; a stop reaches no other run, not even another run of the same program.
- `packages/viewer/test/grenade.test.ts`, "PAR-45: clearSmokes() ..." (4 tests, a door handing recording handles): an
  observer's `smoke_grenade` stopped and `smokes` empty; a joiner's stream stopped, and a rejoin after it starts the
  stream again; the placeholder's puffs emptied, the sprites in the air kept; the control -- without `clearSmokes`
  both pour on, and `clearAir` stops neither.
- `packages/viewer/test/grenade.test.ts`, the real effects player on MP2's data (1 test, skipped without the fixtures):
  `clearSmokes` leaves no run alive (`smoke_grenade`, the `smoke_stream` it called, and a joiner's stream), no source,
  the puffs in the air, and no emission after; and an ordinary smoke through the handle's door equals one through
  `Effects.play`'s, runs, emitted and particles, after 10 s, a `clearAir` and 5 s more.
- `packages/viewer/test/matchThrow.test.ts` (1 test): the part's door calls `effects.run` and the handle it hands is the
  one `clearSmokes` stops.
- RED: `effects.test.ts` 3 of 26 failed, `grenade.test.ts` 4 of 58, `matchThrow.test.ts` 1 of 18, before the source
  change.

## 7. Readings

| name | value | where | status |
|---|---|---|---|
| `CLEAR_SMOKES_PUFFS_READING` | 'left to run out' | `packages/viewer/src/grenade.ts` (`clearSmokes`; the effects handle's `stop()`) | reading, pending review. A smoke the seek stops keeps its puffs already in the air until their lifetimes end; only the emission stops (`particles.ts` :168, :184; research 89 §3). The original frees a source's live particles with it (`FUN_0032a6b0` D:L227162 -> `FUN_00327f70` D:L227179, D:L225737-225758); whether a stopped or ended animation frees its sources at once is unread (`FUN_00270570` D:L118733-118816, in part). Settled by that function's read, or a capture of a smoke at its stream's end. A browser adaptation's choice (the original has no seek), listed in research 101 §4 (PAR-45) |

No `*_PLACEHOLDER`, and no new `*_ADAPTATION` constant: the seek is already `REPLAY_ADAPTATION`'s.

## 8. PAR-46 (triage): a throw drawn off the walk flies over no hull

- Date: 2026-10-11. PARITY-2's row PAR-46 ([brief](../plans/briefs/2026-10-11-par46-throws-off-the-walk.md)), the playtest
  lane's finding, a **triage**: the read, a RED, and the fix written as a row of its own (PAR-46a, below) -- then
  **built** on the coordinator's word, the brief's three-line limit lifted for it (2026-10-11). Base `810e2ffc5` on
  `agent/par46`; the code cited at the base's lines (PAR-46a moves `grenade.ts` and `walk.ts` by two to three lines). Status: **reading, pending review**. Nothing
  was measured running: no browser, game, dev server or match server was run.

**The defect.** `GrenadeThrower.hull()` (`packages/viewer/src/grenade.ts` :1576-1581) builds its cast off
`source.grid()`, which both pages wire to `walk.grid()` (`matchThrow.ts` :157), and `WalkMode.grid()` is null unless
the page is walking (`walk.ts` :1258-1261). Off the walk `hull()` returns the last cast; on a page that never walked
there is none (and `setMap` drops it on a new map, `grenade.ts` :743-745), so `fly()` steps every projectile against
an empty cast (:1585) and the flight passes through the world's walls and floors. The same cast is the scorch's ground
(`groundUnder` :1899-1900, from `explode` :1736). With no cast `stepGrenade` never reports a `rest` (only a hit does,
`scene/src/projectile.ts` :1021-1025), so a blast drawn there had no material: no scorch was laid, and the base
`explosionAnim` played with a null normal in place of the ground's material variant (the review's F1). The fix gives an
off-walk blast the ground's material, its effect and its scorch, as the room's copy rests on that hull. The room
flies the same throws over the map's grid with the map's `DefaultMaterial` (`match/src/room.ts` `hullCast()`
:3709-3711; research 276 §6): the page's drawing parts from the room's.

**The pages that draw throws off the walk.** A throw is drawn on a page by `launchRemote` (another player's, through
`matchThrow.ts` :458 `remoteGrenade`, from `NetPage`'s `grenade` event :1411 and a welcome envelope's `projectiles`
:1165) and by `launchRound` (a launcher's round, :444-446). The page is off the walk:

- a spectator: `NetPage.spectatorWelcome` sets the walk to fly (`netPage.ts` :1214) -- a seat that never walked has no
  cast;
- a dead player watching: the spectator view's `leaveSelf` (:630) sets fly; a page that walked first keeps its last
  cast, so this case is broken only after a map change (`setMap`) or on a page that never stood;
- the replay's viewer: `?replay=` builds a watcher's `NetPage` on `main.ts` (:1651) whose client is a `ReplayClient`;
  the watcher never spawns, so every recorded throw and every throw a seek's envelope lays flies over nothing. The
  modern replay viewer frames the same test room (`modern/replays/worldStage.ts` :15-18), so it inherits it;
- the map viewer's fly mode (`main.ts`) with a room's throws arriving.

**The four readers of `source.grid()`** (the brief's question):

| reader | what it is | the grid it needs |
|---|---|---|
| `c4Pick` :647 | the own C4's target under the reticle | the walking grid: it also needs `aim()`, which is `walk.fireAim()`, null off the walk (`walk.ts` :1245-1247) |
| `startPlacing` :1172 | the own claymore's or PMN's wading test | the walking grid: it returns at `snapshot()` null, which `walk.snapshot()` is off the walk (:1085-1087) |
| `startThrow` :1283 (`throwClear`) | the own throw's clearance | the walking grid: the same `snapshot()` gate (:1274-1275) |
| `hull()` :1576 | every drawn flight (`fly`), the own charge's ground (`placeCharge` :1202), every blast's scorch ground (`groundUnder` :1900) | the map's grid: the flight and the scorch are drawn for any thrower, walking or not |

**Is the map's grid the room's?** For a page that walks, `walk.grid()` is the walker's grid, and the walker is built on
`gridOfGround()` (`walk.ts` :1326; a respawn's `this.walker?.grid ?? this.gridOfGround()`, :784-786), the grid
`setGround` was given (:592-595) or one built once off the ground (:1253-1256). So for a walking page `grid()` and
`gridOfGround()` are the same `Grid` object, and a hull read off `gridOfGround()` is today's cast exactly (the
`castGrid` cache keeps it). The grid `setGround` gets is `groundGrid(map.ground)` on `/testroom` (`main.ts` :1808,
:1829) and the world state's grid on the front end (`matchMount.ts` :584, `world?.grid`, else the walk builds its own);
the room's is `groundGrid(ground)` of its own fork of the same ground (`match/src/server.ts` :321;
`worldState.ts` `forkGround`). Both casts take the map's `DefaultMaterial` (the page's through `GrenadeThrower.setMap`,
:743; the room's `SimMap.defaultMaterial`). They are the same construction over the same disc data, not the same object
(two processes); the world state's revisions (doors, destructibles) turn each side's own copy.

**The RED** (`packages/viewer/test/grenade.test.ts`, "PAR-46: a throw drawn off the walk flies over the map's hull"; a
synthetic floor at y 50 and a wall across z = -300, the PF-28 fix round's ground): another player's M67 thrown at the
wall from 100 u in front of it (`launchRemote`, 1.5 s drawn), against the room's flight of the same throw (`stepGrenade`
over the same grid's `gridCast`, by game frames).

- *The control* (an ordinary `it`, green before and after): a walking page's source (`grid()` the map's) bounces off the
  wall, its bounce count and position equal to the room's to 1e-6.
- *The RED* (committed as `it.fails` with the triage, an ordinary `it` since PAR-46a): a page whose source has no
  walking grid and holds the map's grid apart (`hullGrid()`, PAR-46a's read) draws the same throw; before PAR-46a it
  met no wall (no bounce at z = -300); with it, it bounces as the room's copy, to 1e-6.

**PAR-46a** (proposed at the triage as four lines over three files, past the brief's three-line limit; **built** on the
coordinator's word, as proposed):

- *Files*: `packages/viewer/src/grenade.ts` -- `GrenadeSource` gains `hullGrid?(): Grid | null` (the map's hull, walking
  or not) and `hull()` reads `this.source.hullGrid?.() ?? this.source.grid()`; `c4Pick`, `startPlacing` and
  `throwClear` stay on `grid()`. `packages/viewer/src/walk.ts` -- `gridOfGround()` made public (a public `hullGrid()`
  would clash with the private field of that name, :97), or the field renamed. `packages/viewer/src/matchThrow.ts`
  :157 -- `hullGrid: () => walk.gridOfGround()`. No `main.ts`, `matchMount.ts`, `room.ts`, `replay/*` or `modern/*`:
  both pages and both replay viewers mount the part, so the one wiring covers them; the playtest lane's replay files
  are not touched.
- *RED*: the case above, `it.fails` turned to `it`; and a `matchThrow.test.ts` case ("PAR-46a: the part flies a room's
  throw over the map's hull off the walk": its rig's walk with `grid()` null and `gridOfGround()` the map's) that a
  `remoteGrenade` through the part's `netDeps()` bounces off the wall -- RED before the `matchThrow.ts` line (no bounce
  at the wall), green with it.
- *Acceptance*: the RED green; the control unchanged (bounce for bounce, position to 1e-6 with the room's); the files
  that grep `gridOfGround` or `hullGrid` (`grenade`, `matchThrow`, `matchMount`, `matchWorld` tests) green one at a
  time; the typecheck (the controller's, not run here). Unit tests only: no browser, no rendered or played check of a
  spectator's or a replay's throw.
- Separate from the replay fold's own hull (`ReplayClientOptions.hull`, §5, the playtest lane's RV-7c): that one is
  what a seek's fold steps the recorded projectiles over; PAR-46a is what the page draws them over.

No new `*_PLACEHOLDER`, `*_READING` or `*_ADAPTATION`.

## 9. A round's end stops the effects: the smoke into the next round (BUG smoke round)

- Date: 2026-11-09. Craig's report (2026-11-09): "smokes shot at the end of the round will still have their particle
  effects showing in the next round (before the smoke timer runs out)". Base `802b7e037` on `agent/bug-smoke-round`
  (from `agent/v0417`). Simulation track. Status: **reading** (its review PASS WITH FINDINGS, per the merge 587213d7a). The decompilation was read at the lines
  cited; nothing was measured running (no browser, game, dev server or match server).

**Which side kept the smoke: the page.** The room already drops it: `Room.clearAir` (`packages/match/src/room.ts`
:7559-7565, called at `startRound` :9494 and at the abandon :3844, :3878) empties `flying`, so `detonations()` and
`smokeSources()` (:2886-2898) hold no smoke in the new round and a bot's sight reads none (`MatchBots.smokes`,
`bots/matchBots.ts` :865-879, clears its clouds at a new round too). The page did not: its round clear
(`./matchThrow` `roundStart`, run by `/testroom`'s `armoryRoundHooks` and the match page's `roundClear` on `roundStart`
and `abandoned`) ran `GrenadeThrower.clearAir`, whose own doc kept "the effects already playing" -- the effects
player's `smoke_grenade` and the `smoke_stream` it called, the placeholder puffs' sources (`smokes`, only their pids
stripped, PF-28), and every particle already in the air. A smoke thrown near the round's end so poured on the page for
the rest of its `Timer2 - Timer1` (37 s, research 85 §9.6) into the next round, drawn where the room and the bots had
no smoke.

**The original: a round's end stops what plays.** At an online round's end, `FUN_002a9b30` -- the host 3 s after the
result (D:L150629-150670: the round count up, game state 4 or 6, `FUN_002c00f0`'s send, then `FUN_002aa910` at
D:L150668, then the MP exit state pushed), a page on game state 4 (D:L150617-150626, `FUN_002aa910` at D:L150626),
offline the exit state's push (D:L150599) -- runs `FUN_002aa910` (D:L151203-151253), which:
- stops every running animation of the anim manager 0x414bb0's `common` and `mission` sets (D:L151211-151218: each
  found by `FUN_0026a100` by name -- the strings 0x3f12f8 "common", 0x3f1300 "mission" -- and run through
  `FUN_0026c2e0`, D:L116144-116181, which calls `FUN_002707c0(anim, 0)`, `FUN_0026fbf0(anim, 1)` and `FUN_0026fe90`
  on each animation and each one chained off it; `FUN_0026fe90` frees an animation's sources through `FUN_0032a6b0`,
  §2);
- ages every live particle past its life (D:L151219 `FUN_00326fb0`, D:L225075-225084: each particle on the manager
  0x488480's live list has its `+0xc` set to its `+0x48` + 0.01), so the manager's next update frees them all
  (`FUN_003280a0`, which frees each whose `+0x48` <= `+0xc`);
- online, works the level's projectile list 0x4b5220: `FUN_003cceb0(list, the local player's id, 0xff)` (D:L151239)
  and `FUN_003ccc90(list)` (D:L151242), which sets bit 0x04 of `+6` on every entry; what that bit does is not read
  here (the room's own clear stays `ROUND_START_PROJECTILES_READING`).

So the smoke's stream and its puffs are gone before the round screen, and none is drawn in the next round. (The round
start online is no level reload: `CMPExitState`'s Tick `FUN_00223680` on game state 3 or 5, D:L75913-75936, re-places
the players and pops back to CoreState's OnPop with 0 -- research 322 D6. So the reload's teardown research 95 §8
cites for `ROUND_START_PROJECTILES_READING` is not what clears an online round; `FUN_002aa910`'s projectile calls above
are the nearer evidence, owed their read. Noted for that reading's owner; nothing changed there.)

**The fix (the page).** `GrenadeThrower.clearRoundEffects()` (`clearSmokes`, then every placeholder puff, flash and
spark sprite removed), `Effects.clearRound()` (every run stopped, silently, but the map's ambient runs and what they
called; the tracers' flights and the script rounds' copies gone; then `Particles.expire()`: every live particle gone,
the sources kept, so a running ambient source pours again), both called by `./matchThrow`'s `netDeps().roundEndEffects`, which `NetPage` runs `ENGINE_READ_S` after
the `roundOver` (beside `sweepDrops`), and again from `roundStart` beside `clearAir` as the backstop -- so at the
engine's read and at every `roundStart` and `abandoned` on `/testroom`, the match page and the front end.

**Where the page departs (the reading, `ROUND_END_EFFECTS_READING`, §10).**
- The moment: the original clears 3 s after the result, before the round screen (`FUN_002a9b30` D:L150617-150670).
  The page clears at its own reckoning of that moment -- `ENGINE_READ_S` (`room.ts` :446, the room's 3 s) after the
  `roundOver`, the moment it sweeps its drops (`NetPage.sweepDrops`, `roundEndEffects`; the review's fold, 2026-11-09)
  -- so one latency after the host, as the original's client clears on the host's state's arrival (D:L150617-150626).
  The `roundStart` and `abandoned` clear stays as the backstop (an abandon, a page with no result seen).
- The map's ambient runs are kept: whether the `mission` set holds the map's own ambient animations, and whether they
  start again at the next round, is unread; the page keeps them running, their particles expired with the rest.
- Which effect programs the `common` and `mission` sets hold against the page's effect archives (`effectData.ts`
  `EFFECT_ARCHIVES`) is unread: the page stops every run that is not ambient-rooted.

**Other timed effects checked.** The flashbang's white-out: already stopped at the round's start (`WhiteOut.stop` in
`roundStart`, LATER 12, research 222 §8). A bot's flash blindness (`MatchBots.flashed`, `blindUntil`) is not reset at a
round's boundary, but bots play respawn games only (H315), which have no round boundary before the match's end: no
carry-over to fix. SOCOM II has no incendiary, gas or flare throwable (research 85's throwables); a blast's fire and
smoke are effect runs and particles, cleared with the rest. The scorches and footprints are the decal pools' clears,
unchanged. The room holds no timed effect beside its `flying` list (the smoke's wall and the flash are read from it).

**Tests.** `packages/viewer/test/grenade.test.ts` ("ROUND_END_EFFECTS_READING: clearRoundEffects() ...", two cases,
and the real effects player's case on MP2's data), `effects.test.ts` ("ROUND_END_EFFECTS_READING: Effects.clearRound()"
synthetic, and "... on the game's data": MP2's `smoke_grenade` beside its ambient `firey_flames`), `matchThrow.test.ts`
(`roundStart` calls both; the fold: `netDeps().roundEndEffects` clears the effects, not the air), `netPageRound.test.ts` (the fold: `roundEndEffects` once at `ENGINE_READ_S` after a `roundOver`, not a millisecond before). RED: 6 failed (`clearRound` / `clearRoundEffects` not functions; the wiring's spy). GREEN:
the three files 220 passed, 1 skipped (a pre-existing MP2 sound-bank skip in `matchThrow.test.ts`).

## 10. Readings: the round's end

| name | value | where | status |
|---|---|---|---|
| `ROUND_END_EFFECTS_READING` | at each `roundStart` and `abandoned`: every effect run stopped but the map's ambient ones, every particle gone, every grenade smoke and placeholder puff gone | `packages/viewer/src/effects.ts` (`clearRound`), `packages/viewer/src/particles.ts` (`expire`), `packages/viewer/src/grenade.ts` (`clearRoundEffects`), `packages/viewer/src/matchThrow.ts` (`roundStart`, `netDeps().roundEndEffects`), `packages/viewer/src/netPage.ts` (`roundEndEffects` beside `sweepDrops`) | reading (the merge 587213d7a's review). The original's round end runs `FUN_002aa910` (`FUN_002a9b30` D:L150599, D:L150626, D:L150668): the `common` and `mission` anim sets' runs stopped (D:L151211-151218, `FUN_0026c2e0` D:L116144-116181) and every live particle aged past its life (D:L151219, `FUN_00326fb0` D:L225075-225084). Departures (§9): the page clears `ENGINE_READ_S` after the `roundOver` (`NetPage` `roundEndEffects`, one latency after the host, as the original's client), with the `roundStart`/`abandoned` clear as the backstop; the map's ambient runs are kept (whether the original's `mission` set holds them and restarts them is unread); the sets' membership against the page's archives is unread. Settled by a capture of a round's end with a smoke pouring and an ambient effect in view, or the read of `FUN_002707c0`/`FUN_0026fbf0` and the sets' loading |
