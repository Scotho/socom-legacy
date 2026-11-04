# 350 -- Respawn's held game-lobby lifecycle

- Date: 2026-10-21.
- Task: RSP-4, simulation track, in the [respawn fixes plan](../plans/2026-10-21-respawn-fixes.md).
- Base: `c0aa58194224e214f0ea32da5c41f288ec644ce3`.
- Status: selected original final-screen scripts **reading**, fresh review **PASS (medium)**, 2026-10-21; the executable
  dispatch and barrier citations below remain inherited, **reading, pending review**, and await a verified source re-read. No runtime proof is claimed.
- Scope: a respawn `Room` explicitly configured with `heldLaunch: true`, using the existing game-lobby launch,
  loading barrier and full-game return. Respawn remains parked by the existing release gate.

## 1. A held game waits for its lobby's launch

[Research 356 F7](356-original-multiplayer-respawn-audit.md#f7-the-dormant-respawn-lifecycle-bypasses-the-original-lobby-launchreturn-path)
identified that respawn entered play at construction even when its room requested a held launch. The existing
game-lobby machinery already has the launch and load barrier; this task applies it to a held respawn game.

The room now begins in `waiting` when held, under either ruleset. Both teams can sit without starting a round,
countdown, round clock or match identity. A waiting welcome carries the existing `waiting` phase, omits `startTick`,
and reports a side still empty through the existing waiting flag. Seats made while waiting are not marked as joins
to an in-progress match. After play has started, respawn's existing tick-based join mark and non-ghost policy remain
unchanged; their original late-join policy is not established here.

The existing public `launch` path still refuses a one-sided launch, accepts `launch(0)` for the lobby's all-ready
launch, or runs the requested countdown. With a configured load barrier, both players' existing `loaded` reports
release it once, followed by the existing post-barrier hold. No launch, load or phase duration was introduced.
The launched round carries RSP-2's original 1200 seconds / 1 round ([research 348](348-respawn-clock-and-result.md)).

The launch/barrier executable citations are inherited from research 159 and 221: `FUN_002c3cf0`,
D:L165373-165384 (all-ready launch), `FUN_002c4020`, D:L165414-165441 (loaded-player barrier), and
`FUN_001f5e70`, D:L55748-55755 (the host's existing post-barrier hold). They were not re-read in this task.
The load-barrier ceiling is the existing server adaptation; tests using it do not attribute that ceiling to the game.

## 2. The final screen returns to the same game lobby

Fresh source inspection read the copied original `RUN/MPZANIM.ZAR` through `FsAssetSource`, `Zar.parse`,
`parseAnimSets` and `decodeUiProgram`, selecting set `dlgMultiplayerFinalReally.rdr`:

| animation | original commands in order |
|---|---|
| `call_gamelobby` | WAIT 10 seconds; CALL `return_to_gamelobby` |
| `return_to_gamelobby` | STOP `ExitOnStart`; set `player_ready_count = 0`; set `mp_x_sec_clock = 11`; UI `CloseAndSwitch(dlgGameLobby.rdr)` |

Neither selected animation tests the respawn setting. This re-read supports the shared final-screen return path
recorded in [research 309 R309.1/R309.3](309-clan-games-the-swap-after-a-game.md#2-the-return-to-the-game-lobby-after-a-full-game-the-original).
The execution dispatch is still the inherited reading: `FUN_002a9b30`, D:L150647 and D:L150660-150664, records the
full-game result; `FUN_00281a70`, D:L128122-128130, takes the online host back to the menu state and resends the game
object. No decompilation export or independently verified executable was available for a fresh re-read. The
controller's refused DNAS extraction is recorded in the plan's Log; no unverified executable was used here.

After a held respawn game's single round and the existing result screens, `clock` now calls the existing
`returnToLobby` under either ruleset. That method retains its counter reset, projectile/turret cleanup, side-preserving
seat rebuild, lobby voice reset and `onMatchReturn` callback. The callback observes the waiting state and runs once;
no `abandoned` event or automatic next match is introduced. A subsequent explicit lobby launch starts round 1 of
the next match identity. An unheld dedicated respawn room retains its existing continuous lifecycle.

The existing `EXPIRED_PLAY_S`, `RESULT_S`, `ENGINE_READ_S`, `FINAL_ROUND_S`, `GAME_COMPLETE_S` and
`ROUND1_AFTER_BARRIER_S_READING` values are reused without change. The selected script's WAIT 10 agrees with the
existing GAME COMPLETE hold; this task does not re-establish the other phase-duration readings or change them.

## 3. Verification and limits

All behavioral tests use the Room's public hello, launch, clock, match identity, text command, emitted event and
callback seams. Synthetic geometry, two-second rounds, time advanced by test ticks and the load-barrier ceiling
are instruments. No private Room state is read by the new tests.

| evidence kind | result |
|---|---|
| RED before the waiting correction | 1 failed: welcome expected `waiting`, received `play` |
| RED before the return correction | 1 failed, 1 filtered skip: expected one return callback, received none |
| requested targeted unit run | 4 files, 43 passed, 0 failed, 0 skipped |
| focused existing central-room controls | 3 passed, 0 failed, 190 filtered skips; includes existing classic held return |
| original-data inspection | the two selected final-screen animations re-read through repository readers |
| rendered browser / physical playtest / original-runtime comparison | not run by this worker |
| all-map walk / full suite / workspace typecheck / build / gate | not run by this worker; controller verification remains |

The first REDs were behavioral assertion failures, not dependency or setup failures. Dependencies were installed
separately in the script-created task worktree. The approved existing central-room assertions now retain unheld
continuous respawn only and carry the already corrected one-round default. Classic's launch and return controls pass.

Commands from `socomlegacy/`, with `SOCOM_DISC` set to the ignored copied original-disc extraction:

```sh
../node_modules/.bin/vitest run packages/match/test/roomRespawnLifecycle.test.ts packages/match/test/roomLaunch.test.ts packages/central/test/round.parity.test.ts packages/match/test/roomRespawnRules.test.ts --maxWorkers=2
../node_modules/.bin/vitest run packages/central/test/room.test.ts -t 'ONL-20b: an unheld respawn|the room reports its rules|ONL-20b: a held room' --maxWorkers=2 --reporter=dot
```

The release gate, central bridge/services/host, spawn picker, late-join ghost policy, clocks/scores, prompt, audio
and animation are outside this correction. No new original value or placeholder is introduced, so there is no new
ledger entry. Executable dispatch remains inherited, pending re-read; a capture-scored lobby-to-match-to-lobby cycle
is still needed for runtime proof. This note records a corrected underlying Room path, not an enabled end-to-end
respawn mode. Shared indexes, the corpus and the plan's Log remain the controller's responsibility.

## 4. Independent review

The fresh reviewer independently decoded the selected `MPZANIM.ZAR` animations, reran the requested four-file set
(43 passed, 0 failed, 0 skipped) and the selected central controls (3 passed, 190 filtered-out). An in-memory compile
of the parent source reproduced both old behaviors: immediate play and the automatic restart with no return
callback. Historical RED is author-reported. The executable-source limitations above remain in force.
