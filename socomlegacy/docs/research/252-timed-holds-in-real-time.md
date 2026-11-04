# 252 -- Timed holds in real time: the claim hold and the sweep (PAR-24)

- Date: 2026-10-08 (web sprint PARITY-1, wave 1, seat B; plan
  [`../plans/2026-10-08-web-sprint-parity.md`](../plans/2026-10-08-web-sprint-parity.md), row PAR-24 and gate E01;
  branch `agent/par24`, base f76051f4 = `main` 96c9fcae + research 230 + the plan).
- PAR-34 (2026-10-12, PARITY-2; branch `agent/par34`, base efd2b09fd): the owed timers of §3 and §4 given their dispositions in §3, group by group; the readings it adds (`FUN_00593da0`'s second candidate, the room's command clock for the rifle's rate and locks) are **reading, pending review**.
- Status: **reading, pending review** for the original's side (one decompilation line, re-read here: §1); **as built**
  for the port's side (unit tests and the mount's fakes, no browser, no game run). No new duration, tolerance or
  liveness constant: the rule is ACT.R8's, the durations are the rules' own (`PICKUP_PROMPT_COOLDOWN_READING`,
  `STANCE_HOLD_S_PLACEHOLDER`, a turret record's `FireWait`).
- Sources: ruling ACT.R8 ([`../plans/2026-10-07-actions-on-the-menu-match.md`](../plans/2026-10-07-actions-on-the-menu-match.md));
  research [250](250-the-actions-on-the-menu-launched-match.md) §7 (finding 3, finding 6 and their ACT.R8 notes) and
  §8 (the hold on room ticks, the cadence of a page's commands, "Observation, not fixed here"); research
  [230](230-gameplay-feel-parity-audit.md) §4.2 (the ACT supplement paragraph); research
  [234](234-the-inventory-as-built.md) (the claim hold, `PICKUP_PROMPT_COOLDOWN_READING`); research
  [208](208-the-game-frame.md) §0 and [110](110-the-frame-clock.md) R110.4 (the original's frame time).

## 1. The rule: ACT.R8, and what the original counts

ACT.R8 (2026-10-08, the owner's call via the main merge controller) rules that **a timed hold takes the original's
real time on any honest machine, and never less for anyone**, and names the general rule for this sprint: timed holds
count real time, not page frames, the page-side claim hold under 10 fps being its row. The room's plant and defuse holds
are ACT.R8's as built (`match/src/bomb.ts` `step`: elapsed room ticks while the held state is live,
`HOLD_LIVE_TICKS_PLACEHOLDER` 15); PAR-24 does not touch them, and `packages/central/test/roomBomb.test.ts` stays green
unchanged (21 of 21 on this branch).

The original's side, for the claim hold: `FUN_00593da0` takes its float argument off the weapon prompt's hold `+0x23c`
while a candidate is in reach (D:L452547-452549, and the second candidate's branch D:L452563-452565). The argument is
the one the player controller's per-frame update `FUN_00594cf0` is called with and hands on (its signature D:L453025,
the call D:L453705; research [85](85-grenades.md) and [202](202-r2-c3-combat.md) name `FUN_00594cf0` the player
controller's per-frame update). Research 208 §0 has the
original's game frame take one core tick with its **measured** dt (`DAT_004a449c`), and research 110 R110.4 a dropped
console frame be one long tick with its measured dt. That the update's argument is that measured dt is read here by
the update's role, not traced through its dispatch: a reading. Either way the port's rule is ACT.R8's.

The page side before PAR-24: both pages clamp a frame's step to 0.1 s (`main.ts:1555`, `matchMount.ts:620`: "a
backgrounded tab must not teleport the camera" -- a browser adaptation and the simulation's step bound, which stays;
`mover.ts:460-461` `MAX_TICKS` bounds the walker the same way). Every timed rule fed that step runs slow below 10 fps.

## 2. The claim hold as built (E01): the RED, the shape, the GREEN

**The seam** (the brief asked which): the mount's real pipeline on its fakes, `packages/viewer/test/matchMount.test.ts`,
"PAR-24 (E01)". The fake window's frame clock runs at a chosen period (`step(n, ms)`), into `matchMount.ts`'s
`frame(now)` and its clamp, `padFrame`, `playerLanes` (`matchLanes.ts:43`), the action part's `lanes`
(`matchActions.ts:236-237`), and `ActionLifecycle.elapse` (`actionContext.ts:174-175`), spied and passed through. The
menu path mounts no world drops yet (H120, PAR-4), so the mount's lifecycle is never in reach of a weapon. The test
therefore records the seconds the mount hands `elapse` each frame and feeds them to a claim hold armed as a pickup's
release arms it (`ActionLifecycle.release` on the `pickup` context). The stance button's hold (`stanceButton.ts:65`)
rides the same `playerLanes` dt and is measured on the mount directly (`WalkMode.setStance` spied).

**The RED on the lane** (base f76051f4, the cases as plain `it`; `npx vitest run test/matchMount.test.ts -t PAR-24`):

| case | expected | the lane |
|---|---|---|
| the claim hold at 5 fps (0.2 s frames) | ends after 3.0 s of real time, as the 60-fps control does (within one frame: green) | **6.000 s** |
| a 1 s stall between 60-fps frames | ends after 3.0 s, never sooner | **3.917 s** (the stall credited 0.1 s) |
| the frames under the loading hold (2 s) | credit nothing: ends 2 s later | 5 s, within two frames (green: the guard) |
| the stance button's hold at 5 fps | prone 0.4 s after the press's frame, as at 60 fps | **0.8 s** |
| both pages' source | read `FrameTime` and hand the timed rules its real seconds | no `FrameTime` |

**The shape: the frame's real seconds handed beside the clamped step** (`packages/viewer/src/frameTime.ts`,
`FrameTime`). A page calls `frame(now)` once a frame with its monotonic clock (`requestAnimationFrame`'s timestamp,
`performance.now()`). It keeps that frame's real seconds since the frame before, unclamped. The first frame, a clock
that did not advance or ran back, and a reading that is no number give 0. The page clamps what `frame` returns for
the simulation, as before. The timed rules read `real()`.

Why not a wall clock that each rule reads: a rule credited the time since its last read would be credited, at its next
read, the frames it did not run -- the loading hold (`padFrame` returns before the lanes), a page whose lanes stopped.
The frame's real seconds credit a rule only the frames it runs in, each its own duration. So a long frame credits its
real time and no more (the stall case), a paused rule is credited nothing (the loading-hold case), and every rule keeps
its own gates (in reach, held, alive) and its cancels (`ActionLifecycle.cancel` untouched). The room's authority is
untouched: the claim is still the room's to grant (`NetPage.pickup`), the turret's claims still bounded by the room's
'rate' (`room.ts` `fire`).

Where the real seconds go, the general rule rather than one call site: `playerLanes`' `dt` feeds only timed rules --
the action part's lane (the lifecycle's `hold`, which `heldFor` reports, and its claim hold `elapse`) and the stance
button's hold (`matchLanes.ts:43`, `:59`). So each page hands `playerLanes` `frameTime.real()` instead of the clamped
step, and the turret's cadence (`acts.turretFrame`, `TurretTrigger.frame`, `actionWiring.ts:289-290`) the same.
`matchActions.ts` and `matchLanes.ts` do not change: the seconds they are handed become real. The lines are in
`main.ts` and `matchMount.ts`, the HOT files (PAR.R3), so they are the wave-4 integrator's hunk (§4), proven on this
branch by applying it and reverting it (the RED cases then green; `tsc -p packages/viewer` unchanged).

**The GREEN** (the hunk applied): the claim hold at 5 fps ends at 3.000 s (to 1e-9) and the 60-fps control within one
frame of 3 s; the stall case within one frame of 3 s and not before; the loading-hold case at 5 s (within two frames); the stance button at
5 fps prone at 0.400 s. Headless and committed now: `test/frameTime.test.ts` (3 cases); `test/actionContext.test.ts`
"PAR-24" (the claim hold fed `FrameTime` against the clamped step: 3.0 s at 5 fps, at 60 fps and across the stall; 6 s
and 3.9 s clamped); `test/actionWiring.test.ts` "PAR-24" (a 0.15 s gun at 5 fps claims every frame, 0.2 s apart; at
60 fps every 0.15 s, never sooner; clamped, every other frame, 0.4 s apart). The four mount cases that need the hunk are
committed as `it.fails` (a green `it.fails` means the mismatch persists, PAR.R2); the integrator drops the `.fails`
with the hunk.

## 3. The sweep: every page-side consumer of the clamped step or of frame counts for a timed rule

Method: the brief's `grep -n "getDelta\|Math.min(.*0\.1\|elapse(\|countdown\|cooldown"` over `packages/viewer/src`,
then every `dt` the two pages' frames hand on (`main.ts:1553-1634`, `matchMount.ts:616-668`) followed to its first
timed use, and the wall-clock reads (`performance.now`, `Date.now`) in the match's parts. Source inspection; line
numbers on f1890cf13. Dispositions: **real-time already**, **converted here** (the wave-4 hunk, §4), **not a timed rule**
(a frame-based animation, presentation or the simulation's step: stays), **owed** (a timed rule left on the clamped
step, its file another row's: proposed below as one follow-on).

| consumer | what it times | disposition |
|---|---|---|
| `main.ts:1555`, `matchMount.ts:620` the 0.1 s clamp | the simulation's step bound (a browser adaptation) | **stays**; the real seconds are read beside it (`FrameTime`, §2) |
| `actionContext.ts:174-175` `ActionLifecycle.elapse`, via `matchActions.ts:237` | the claim hold, `PICKUP_PROMPT_COOLDOWN_READING` 3 s | **converted here** (`playerLanes` handed `frameTime.real()`) |
| `actionContext.ts:147-151` `ActionLifecycle.hold`, via `matchActions.ts:236` | `heldFor()`: seconds a context is held (no production reader; the room times the plant, ACT.R8) | **converted here** (the same line) |
| `stanceButton.ts:60-66`, via `matchLanes.ts:59` | the stance button's hold to prone, `STANCE_HOLD_S_PLACEHOLDER` 0.4 s | **converted here** (the same line) |
| `actionWiring.ts:289-290` `TurretTrigger.frame`, via `matchActions.ts:259-262` | the mounted gun's cadence (the room drops an early claim as 'rate') | **converted here** (`acts.turretFrame(frameTime.real(), ...)`); its one claim a frame stays (§4) |
| `bombPage.ts:317` `BombPage.tick`, once a command (`matchActions.ts:292`; f1890cf13's :147-152 / :197-200) | the page's prediction of the plant/defuse hold (drawn since PB-8: `holdBar`) | **converted (PAR-34 group 6, 4c54cbf7c)**: counting commands was not right -- the room advances a hold one a room tick while live (`match/src/bomb.ts` `step`, ACT.R8), and a 5-fps page sends 6 commands a frame against 12 ticks, so the bar ran at half the room's rate (10 s) and a flood would have hurried it; the commands now begin, keep and reset the hold, its progress the room's ticks as the page reckons them (`serverTick`) from the first held command's (5 s at 5 fps, within a frame). Not modelled: the room's pause after `HOLD_LIVE_TICKS_PLACEHOLDER` ticks with no command Below about 4 fps the room's pause (`HOLD_LIVE_TICKS_PLACEHOLDER`) makes the page's bar run ahead of the commit (3 fps: 5 s against about 6.7 s) -- named, not modelled (the review's F-a). |
| `inventoryMenu.ts:587`, `:592` (`padFrame`'s `inventory.frame(.., dt)`) | the R2 inventory's idle close, `INVENTORY_IDLE_CLOSE` 5 s (beside its slide and fade, animations) | **converted (PAR-34 group 2, 836e2c432)**: `InventoryMenu.frame(.., dt, real)`, the idle count real (10.2 s at 5 fps before, now within a frame of 5 s); the slide and fade keep the clamped step (presentation) |
| `matchFirearm.ts:608` `fire.update(dt)` (`fireFrame`) | the rifle's rate, the reload, a held trigger's rounds | **not a page-side timed rule: the room's command clock, kept (PAR-34 group 1, 87c8e403c)**. A round names the walker's last command (`NetPage.fireEvent`), and the room checks the rate on the command count (`room.ts` `fire`: `frame.count - p.lastFire[w] < cycle`) and times the reload's and the after-shot lock on it (`setLock`, "on the command clock"); the walker sends one command a 1/60 tick of the clamped step, so a real-seconds rate would send two rounds a 5-fps frame naming one command and the room would drop the second as 'rate'. Pinned through the mount at 5 and 60 fps. The scoped kick (a view turn) is the simulation's too |
| `matchFirearm.ts:598` `kit.frame(dt)` (`kitFrame`) | the weapon swap's hand-off and end | **not a timed rule on the page (PAR-34 group 1)**: in the match the swap follows the walker's clip (`swapProgress`, `matchFirearm.ts:387`), the simulation's ticks; `dt` is read only by the no-host path |
| `play.ts:385` -> `weaponRaise.ts:170-175` (`play.frame(dt)`) | the rifle lowered 5 s after the last trigger edge | **converted (PAR-34 group 1, 87c8e403c; the others' bodies, review F2, 88f455cae)**: `WeaponRaise.frame(dt, input, real)`, the countdown (`FUN_00594cf0` `ctrl+0x234`) real (10.2 s at 5 fps before, now 5.000 s), handed through `Play.frame(.., real)` by both pages and by `RemotePlayers.frame`; the envelope (the Fire clips' blend, 0.1 s in, 0.5 s out) keeps the clamped step (presentation, beside the clips) |
| `matchThrow.ts:454-456` `grenade.update`, `rocket.update`, `whiteOut.update` (`throws.frame(dt)`) | the held throw and fuse on the page, the launcher's rate, the flash's wash (the room steps its own grenades: research 208 §0) | **converted, in part (PAR-34 group 3, 4c5afbd40)**: `throws.frame(dt, real)`; real: the held throw's power (`FUN_00594cf0`'s chase, stepped at most `THROW_POWER_STEP_MAX_S` 0.1 s at a time -- a browser adaptation, the pages' own bound, so a stall cannot carry it past the pressure), the C4 settle (`FUN_005be6f0`), a smoke's life, the flash's blind (`WhiteOut.update`), and **the flight's game frames**: *corrected* from "the flight's 30 Hz steps are the simulation and stay" -- the accumulator is now handed real seconds and still steps `GAME_FRAME_DT` at a time (MISSION R8's arithmetic unchanged, at most `GAME_FRAME_MAX_STEPS` a frame), because the page's flight is its copy of the room's, which the room steps one advance a room tick (`room.ts` `flyGrenades`): on the clamp a 5-fps page's grenades flew at half speed and went off at 6.2 s against the room's 3 s. Kept on the clamped step: the throw's clips (release, recovery, placing: the body's clips, and the room counts a throw's repeat on the command clock, `throwGrenade`), the launcher's rate (the command clock: `launchRocket`'s `p.ran < p.rocketWaitUntil`), a refusal's message and the particles (presentation) |
| `hud.ts:1148` `Hud.render` -> `step` (its own `performance.now()` delta, clamped to 0.1 s) | the message window's lifetimes (`:1137`), the round-start banner and fader, the stance fade, the marks' and the prompt's pulse | **converted, in part (PAR-34 group 4, 01cea7f59)**: `step(dt, real)`; the round's clock `sinceOn` (zeroed at the room's round start) counts real seconds, so the round start's fader and banner, the ammo box's spawn fade and the message window's lines scheduled on it keep the room's round (the spawn fade 3 s and a message 14.8 s at 5 fps before; now 1.5 s and ~7.4 s). Presentation, kept on the clamp: the stance fade (pinned), the marks' and the prompt's pulses, the help lines, the event banner's seconds, the hold bar's fade |
| `main.ts:1625` the fps readout (`ui.setFps`) | smooths the clamped dt, so it cannot read below 10 fps | **not a timed rule** (a playtest instrument); its truth below 10 fps is owed (a HOT line) |
| `walk.frame(dt)` -> `mover.ts:1667-1670` (`MAX_TICKS` 30), `mover.ts:1799` `elapse(ticks)` | the walker's fixed 60 Hz ticks and one command a tick | **not a timed rule**: the simulation's step under the clamp; the room's holds count room ticks (ACT.R8), so fewer commands below 10 fps do not slow them |
| `fly.update(dt)`, `firearm.gunFrame`, `firearm.aimReticle`, `firearm.effectsFrame`, `throws.poseFrame`, `play.frame`'s clips, `doors.frame`, `world.step`, `view.frame`, `net.frame` (`remote.frame`), `tacMap.frame`, `armory.frame` | the look and camera, the bloom and zoom, the reticle, effects, clips, the doors' swings, scene programs, flares and oceans, the others' interpolation, the map's and the ARMORY's scripts | **not a timed rule** (frame-based animation and presentation): stays | **The review's correction (2026-10-08):** three of `net.frame`'s consumers ARE timed rules -- `remotePlayers.ts:521` adds the clamped dt to `deadFor` and `:530` hides a corpse at `BODY_FADE_S` 10 s (`net/deaths.ts:222-223`, `FUN_005979a0` D:L454491: a 5-fps page keeps a corpse ~20 s of real time; a joiner's corpse starts at the room's real age then counts at half speed), the hostage's rescued fade (`fadeStep(..., dt)`, `:527`) and `headLook.ts:215`'s glance countdown -- owed in s4. **PAR-34 group 5 (2f51276cc):** the corpse's fade converted (its own real age `fadeAge` beside `deadFor`, the death pose's clip clock, which keeps the clamped step: 20.2 s at 5 fps before, now `BODY_FADE_S`), the hostage's rescued fade converted (2.8 s before, now 1.4 s), both handed through `NetPage.frame(.., real)` scaled by a replay's `dtScale`; **the glance countdown kept as presentation** -- *corrected* from the review's "timed rules": it schedules the head's idle glances, run with the head's rotator (`HeadLook.advance`) on the animator's clamped step, and changes nothing but where the head looks.
| `matchTaunts.ts:93` (`TAUNT_DELAY_SECONDS`), `main.ts:290`/`:329` (WEAPON EXCHANGE's and the ARMORY's clocks), `netPage.ts:987`, `:1043`, `:1062` (the round's clock, the launch countdown, the round screens: `performance.now()` ms), `matchThrow.ts:196` (`firearmReadyAt`), `matchFirearm.ts:632` (the range finder), `camera.ts:105`/`:816` (`DOUBLE_TAP_MS`) | the taunts' cooldown, the screens' clocks, the round screens' and the launch's countdowns, the launcher's lower, the range's rate, the sprint's double tap | **real-time already** (a wall clock) |

## 4. Owed

- **Done, PAR-34 group 5 (2f51276cc):** the body and rescued fades converted, the glance kept as presentation (§3). (the review, 2026-10-08) The body fade (`BODY_FADE_S`, `remotePlayers.ts:521-530`), the hostage's rescued fade (`:527`) and the glance countdown (`headLook.ts:215`) read the clamped dt and run slow below 10 fps: the same conversion as the claim hold's, owed to the integrator's wave-4 hunk or a PARITY-2 row (the corpse's age is the room's at the join: the page then counts at its own rate).
- **Ported, PAR-34 group 7 (671f9bbd8): `PICKUP_HOLD_PER_CLASS_READING` (`drops.ts`, research 234 §7; reading, pending review).** The second candidate is read: `FUN_00541d40` (D:L409206) puts a weapon drop whose `+0xd` bit 1 is set (`FUN_0059f730` D:L458445 (a corpse's; `FUN_0059ec60` D:L458047 the replicated node's): `FUN_005b8820` class 2, the pistols, ids 4-30) in the second output and every other weapon in the first; a classic death lays a weapon per firearm slot (`FUN_005a0040` D:L458646-458706), so the two-candidate frame is reachable beside any fresh corpse and the 3 s hold ends in 1.5 s. Both pages lend `candidates: () => drops.holdCandidatesAt(walk.feet(), walk.snapshot()?.yaw ?? 0)` (`main.ts`, `matchMount.ts`; PAR-34 efcd89bb7). (the review, 2026-10-08) The original's `FUN_00593da0` subtracts the frame's time from the hold TWICE on a frame where both of its candidates are found (D:L452547-452549, D:L452563-452565: a weapon and the second, `+0x150`, candidate in reach end the 3 s hold in ~1.5 s); the port counts once. A parity gap, owed beside `PICKUP_PROMPT_PICK_PLACEHOLDER` (research 234, which already owes the reading of `FUN_005a9c70`/`FUN_005a9f40`); whether the second candidate can be in reach on a real map is the reading that settles it.

- **The wave-4 hunk (PAR.R3), for the integrator.** `main.ts`: `import { FrameTime } from './frameTime';`;
  `const frameTime = new FrameTime();` beside `const stanceButton` (module scope); the frame's
  `timer.update(); const dt = Math.min(timer.getDelta(), 0.1);` becomes
  `const dt = Math.min(frameTime.frame(performance.now()), 0.1);` (three's `Timer` and `const timer` go: nothing else
  reads them); `padFrame`'s `playerLanes(lanes, padGame, game, frameTime.real(), { walking, menu });`;
  `acts.turretFrame(frameTime.real(), walk.isDead());`. `matchMount.ts`: the same import; `let last = -1;` becomes
  `const frameTime = new FrameTime();` and the frame's two `last` lines `const dt = Math.min(frameTime.frame(now), 0.1);`;
  the same `playerLanes` (with `menu: chat.owns`) and `turretFrame` lines. The tests that pin those lines by text move
  with them (`matchMount.test.ts`'s lane-order and frame-order pins, `matchLanes.test.ts:132`), and the four PAR-24
  mount cases drop `.fails`. The exact patch is in the PAR-24 report; it applies cleanly on f1890cf13.
- **A follow-on row: PAR-34 (PARITY-2), done 2026-10-12** -- the dispositions in §3; the fps readout's truth below 10 fps stays owed (a HOT line). **The proposal as written:** the remaining page timers in real time. The owed lines of §3,
  each in its owner's file: `fire.ts`'s rate and reload, `kit.ts`'s swap, `weaponRaise.ts`'s lowering (seat A, PAR-19);
  the throwables' fuse, rate and wash (PAR-20's area); the R2 inventory's idle close; the HUD's message and fade timers;
  `BombPage`'s prediction (per command, stale against ACT.R8, no production reader); the fps readout.
- **The turret's one claim a frame.** Converted, `TurretTrigger` claims at its interval or once a frame, whichever is
  slower. Below 1 / interval frames a second (a PKM's 0.1 s below 10 fps) the page still claims fewer rounds than real
  time allows. Whether a slow page should claim several rounds in one frame is the room's 'rate' rule's question, not
  read here.
- **An observation on the original -- since ported, PAR-34 group 7 (above).** On a frame where both of `FUN_00593da0`'s candidates are found (the
  `+0x14c` branch and the `+0x150` branch), each branch takes the argument off `+0x23c`, so the hold runs down twice
  that frame (D:L452547-452549, D:L452563-452565). The port's `elapse` counts once. What the second candidate is
  (`FUN_005a9c70` / `FUN_005a9f40`'s second output) is not read here; research 234's row is where it would be settled.
- **The browser runs.** None from this seat (no browser, PARITY-1's host rule). The gate's menu-match specs (PAR-27) are
  where a slow page's claim hold and stance would be seen running.
