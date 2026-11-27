# 444 -- The ground walk's floor test at the frame's end (LATER 1148, Crossroads' wall top)

- Date: 2026-11-17. Branch `agent/later-1148` (worktree `wt-later-1148`), base 948a123834 (the RED,
  `viewer/test/crossroadsWallTop.test.ts`); LATER 1148; the core lane's brief, phase A (new files only; `mover.ts` untouched,
  its claim pending), and the main controller's two changes relayed by the core lane seat the same day (relay-1's r0004 look,
  below). Research number 444 is provisional, claimed with this branch.
- Track: simulation. Status: section 2 is **reading, pending review** -- transcribed from the decompilation (`socom2_game.elf`,
  read at the source by the author of this note on 2026-11-17) and held by no unit test yet (the fix is phase B). Section 3's
  match against the original is the bugs lane's read of relay-1's rows (`bugs/P10-crossroads-rows-read.md`, UNREVIEWED),
  cited here as that read says. This seat did not read the rows themselves; trial (B) is as relayed.
- Evidence kinds, kept apart: **(D)** source inspection -- the decompilation at the lines cited, and the port; **(C)** the
  bugs seat's P10 read (`agent-mail/evidence/weekend-mega-2026-11-14/bugs/P10-crossroads-wall-fresh-read.md`, UNREVIEWED):
  the recording and the disc's collision through the repository's readers; **(M)** a measurement of the port,
  `viewer/test/floorlessEdgeCensus.devdisc.test.ts`, run once on MP72 (section 6); **(O)** the original running: relay-1's
  memory trace on r0004 (17 trials, MP72), read by the bugs lane, not by this seat (sections 3, 7).
- New names: section 9 (phase B). A proposed name for phase B, `GROUND_FLOOR_PROBE_READING` ('frame-end' | 'sub-step'), mirrors
  `AIR_FLOOR_PROBE_READING` (`viewer/src/mover.ts:554`); it enters the ledger with the code that declares it.

## 1. The cause (C)

- On the disc's own collision (MP72), between `worldmodel/b2_wc07`'s top (a floor at y 98.81 from x 1526.77 east) and
  `worldmodel/wc25/di_road25`'s east edge (y 42.5) is a wedge where no polygon is a floor: 0.14 u wide at z 1200, 1.01 at
  z 1269, 2.01 at z 1350 (P10 s2).
- The port's ground walk takes a tick's move in sub-steps of at most `MAX_SUBSTEP` = 1 (`mover.ts:177`, the port's own),
  each through `step`, which refuses a sub-step whose column has no floor (`mover.ts:95-104`, `step`/`groundEndpoint`
  `:5434-5467`; `move` `:5150-5168`). At the 60 Hz tick a 65 u/s move is 1.08 a tick in two 0.54 sub-steps; each lands in
  the wedge and is refused, so the body is held on the top (the RED).

## 2. The original's ground step (D; reading, pending review)

1. **One step a frame, taken whole.** `FUN_005506a0` (D:L417804), once an actor's frame while its `+0xf40` byte is set
   (D:L417822): `DAT_0066aab8` takes the actor's `+0x20` (D:L417824), then the solve `FUN_005483d0` (D:L417825), then
   `FUN_005b0840` (D:L417826). In `FUN_005483d0` the new position `+0xf54..+0xf5c` is the node's translation plus the frame's
   displacement `+0xf44..+0xf4c`, one vector add (D:L413918). There is no positional sub-step: the loops before it run over
   the contact records (gathered at D:L413409-413457, at most 0x40; worked at D:L413533-413597, D:L413769-413815,
   D:L413829-413857, D:L413882-413900), which change the displacement against walls, not the position in parts.
2. **The walls along the move** are those contact records (the segment body, `FUN_0054aa30`, as research 86 and the port's
   `resolveSegments` read it), and a further sweep `FUN_00516f10` from `+0xe4` to `+0xf54` that shortens the move
   (D:L413920-413940; corrected in s9, finding 4: a capped push, not a shortening), gated by `DAT_0066b000` or two bits of the controller's object (D:L413920-413922). This is the
   original's counterpart of what `MAX_SUBSTEP` guards in the port (a wall not stepped through); the floor plays no part in it.
3. **One floor probe, at the frame's end.** `FUN_005b0840` (D:L467169): skipped when bit 0x8 of `+0x1061` is set
   (D:L467200-467202) or when bit 0 of `+0xe1` is clear and the controller's vtable `+0x2c` answers no (D:L467203-467213).
   Otherwise it queues one record (type 1, D:L467267) whose origin is `+0xf54` (D:L467215-467217), its y raised to at least
   `DAT_0066aab8` (D:L467218-467220), plus the root node's offset turned by the body's matrix (D:L467221-467251; in state 3
   only the offset's y, D:L467252-467254, else the whole offset, D:L467256), and the last hit's layer mask (D:L467281-467282).
   The record holds an origin and a mask and no length (`FUN_002dc6e0` D:L180515, `FUN_002dc660` D:L180480).
4. **The probe read, once.** `FUN_00550570` runs the queued batch (`FUN_005b0800` -> `FUN_0031de90`, D:L417768-417770) and
   then `FUN_005b0420` (D:L417771). `FUN_005b0420` (D:L467032) picks with `FUN_005b5d40(1.0, ..)` (D:L467055):
   - **a hit:** `FUN_0059ad30` takes it (D:L467105), and the hit becomes the last hit `+0x400..` (D:L467123-467143);
   - **no candidate**, with `DAT_003df1c8` set (research 399 s2: 1 in r0001 and r0004): the node's translation is put back
     at the last hit `+0x400..+0x408`, and the speeds `+0x1340` and `+0x111c` are zeroed (D:L467091-467103).
5. **The pick.** `FUN_005b5d40` (D:L470165-470298): over the record's candidates, the highest at or under the origin's y +
   1.0, else the lowest (D:L470233-470241, D:L470259-470261); refused if it is more than 20 over the actor matrix's y
   (D:L470272-470274). **There is no lower bound**: a floor far below is a hit.

What follows, by reading:
- **The end column has no floor:** the whole frame's x/z is refused, put back at the last frame's end that had one. The body
  does not slide, and it does not go airborne.
- **An in-between column has none, the end column has one:** nothing tests the in-between column. The step is taken. Where
  the end floor is more than `ground_touch_distance` (8) below, the body falls.
- **So the hold depends on speed:** a body is held at a floorless strip exactly when no frame's end lands past it. A frame's
  step is speed x one game frame (G = 525/15734 s, `scene/src/gameFrame.ts`).

## 3. Walk and run at b2_wc07's top (D; O as the bugs lane read it; M)

- **The speeds.** The port's constants, from `READERC.ZAR/motion.rdr` via `scene/src/tuning.ts`:
  - the run band `seal_run`, 40.1-65 u/s (tuning.ts:305);
  - the walk band `seal_walk`, 0-26 u/s (tuning.ts:303);
  - the crouched walk `seal_crouchwalk`, 14.8 u/s (tuning.ts:331).
  The walk has no sprint (`viewer/src/camera.ts:61-64`, W2.R2): full stick is the run, and a part push of the stick is the
  walk. The original's rows: the run is 2.167-2.172 u an update (65.0 u/s), the walk 0.866-0.870 (26.0 u/s), the crouched
  walk 0.466-0.470 (14.0 u/s). The run ramps 0.362, 0.724, 1.083, 1.447, 1.807 an update.
- **The wedge** is about 1.0 u at z 1269 (1.05 by the census's 0.05 scan; it ends near x 1525.76), and 0.39 at z 1220.
- **Walking at z 1269**, a step of at most 0.87 ends inside the wedge. That is a miss, so the step is put back: HELD.
  - The rows: held 4 of 4 standing, at x 1526.93-1527.00, and crouched.
  - Section 2: a match.
- **Running at z 1269**, from x 1528:
  - 0.362 to 1527.64, then 0.724 to 1526.914;
  - the next update (1.083, ending at 1525.83, in the wedge) is refused, dx 0;
  - the next (1.447, ending at 1525.47, past the wedge) is taken; the body falls the update after.
  - The rows: OFF 3 of 3.
  - Section 2: a match, provided the speed goes on rising through the refused update (below).
- **Walking at z 1220** (trial B, as relayed: crosses 3 of 3). The 0.72 / 0.87 step from the edge ends past a 0.39 wedge: a
  hit. Section 2: a match.
- **The speed through a refused update (D).**
  - The ground step's velocity is the clip's root velocity: `FUN_0057a330` reads it into `actor+0x2c` (D:L438909-438910),
    and `DAT_0064fc80` scales it (D:L438985). The ramp is the clip's blend by the stick (the port's `SEAL_LOCOMOTION`
    bands), which reads the stick, not the position.
  - The miss branch of `FUN_005b0420` (D:L467091-467103) writes the node's translation, `+0x1340`, `+0x111c` and three bits
    of `+0x1061`. It writes neither `+0x2c` nor the animation's state. So by reading the ramp is not reset by a refusal, and
    the next update's step is the ramp's next value, as the rows show.
  - Which field carries the ramp's progress, and that no other writer resets it on the put-back (the vtable `+0x10` called
    at D:L467100), is not established (s4).
- **Crouched.** In the port a crouch at full stick runs standing (`Walker.posture`, `mover.ts:93-94`; the census's crouch:1
  walks match stand:1's speeds). No stance term was found in the floor rule: the stance reaches the probe only through the
  root offset (s2 item 3).
- **The port today (M, the census's seeds, from the rows' x 1528):**
  - at z 1269, full stick is HELD at -0.33 at 21.67 u/s (the original: OFF, DIFFERS);
  - at z 1269, the walk (stick 0.4, 26 u/s) is HELD (the original: held, MATCH);
  - at z 1220, the walk is HELD (the original: crosses, DIFFERS).
  The bugs lane's port runs agree: full stick held at 1527.097 for 3 s, the walk held at 1527.110.

## 4. Not established

- **The root node's offset in x/z** in a walk, a run and a crouch (D:L467221-467251). If it is not zero, the probe column
  leads or trails the feet by it. The rows fit a column at the feet, within their 0.1-0.2 u. The port's air probe has the same
  gap (`AIR_PROBE_COLUMN_PLACEHOLDER`, research 399).
- **The ramp's field** and that nothing on the put-back resets it (s3); the vtable `+0x10` at D:L467100 is not followed.
- **The batch query's reach downward** (`FUN_002d3cf0`, not read). The record has no length (s2 item 3). The run's crossing
  shows the road 56 below is a hit.
- **What `FUN_0059ad30` does with a hit 56 below.** The rows show the step taken at y 98.817 and the fall beginning the next
  update (action 9), not at once. The port's `groundEndpoint` takes off at once. Not read.
- **The gates of the probe** (s2 item 3): "once a frame" is an upper bound (research 399 s6).
- **The sweep `FUN_00516f10`'s test** (s2 item 2), and whether its gate is open for a player.
- **Whether the put-back restores y too:** `FUN_003157d0` is given the last hit's y (D:L467099), and research 399 reads the
  altitude `+0x2e4` as carrying the height.

## 5. The fix's shape (phase B, `mover.ts`, its claim pending; held)

- **The unit is the original's update, a game frame (G = 525/15734 s, `scene/src/gameFrame.ts`), not the page's tick.** A
  probe at each 60 Hz tick's end still holds: the run's tick step 1.083 from 1527.10 ends at 1526.01, in the wedge (the bugs
  lane's note).
- **How the 30 Hz update maps onto the 60 Hz ticks.** As the air does (`AIR_FLOOR_PROBE_READING` 'frame-end',
  `mover.ts:535-554`, `airClock`):
  - each tick's move is taken whole after the walls (`resolveSegments`; `MAX_SUBSTEP` keeps its wall guard for the disc
    arm's `slide`);
  - the in-between tick is NOT floor-tested;
  - on the tick that ENDS a game frame, the floor is probed once at the position reached, which is the frame's whole step
    from the last frame's end (`FUN_005483d0` D:L413918, then `FUN_005b0840` D:L467215-467220);
  - a hit is taken (`groundEndpoint`'s rise / step-down / take-off), and its x/z become the last hit;
  - a miss puts x/z back at the last hit, the last frame's end (`FUN_005b0420` D:L467091-467103), and zeroes the slide
    speed only.
  The in-between tick's x/z lies in the wedge for one tick. That is simulation state (the next tick's walls, the
  snapshots), the same port deviation of the 60 Hz tick the air already has (MISSION R8).
- **The speed is kept through a miss**: the ground state's speed and ramp (`ground_`, the clip's blend) are not reset by the
  put-back (s3). Only `stopSlide`, as the air does.
- **A walk must still be held** where its frame's end lands in a strip (z 1269), and must cross where it does not (z 1220).
- Behind the proposed `GROUND_FLOOR_PROBE_READING` ('frame-end' built, 'sub-step' the old rule), so the census can compare
  the two.
- The AI's seam (`deferFloor`, `FUN_005483d0` D:L413918-413955 in `step`) already probes once at the end. Keep it.
- The GREEN pins come from the rows: run OFF on the 4th moving update from x 1528, after one refusal at 1526.914; walk held
  at z 1269; walk crossing at z 1220.

## 6. The census (M)

- `viewer/test/floorlessEdgeCensus.devdisc.test.ts`, a measurement: every ground polygon's boundary, sampled every 4 u.
  A CANDIDATE is a place where the column 0.05 out has no floor and a floor is met again within 2.2.
- Each candidate is walked in the gaits `stand:1` (the run), `stand:0.4` (the walk, 26.0 u/s in the port; the stick is a
  census setting) and `crouch:1`. Each walk is classed `left`, `held` (moved, and stopped within 0.6 of the edge) or `short`
  (a wall, or never moving).
- The seeds carry the original's outcome where the rows give one (z 1269 run and walk; z 1220 walk) and print MATCH or
  DIFFERS.
- A wall baseline: 50 sampled faces, a standing run at each.
- `P1_BASELINE` compares with an earlier `P1_OUT` (which are no longer held, and any wall newly passed).
- **MP72, the third run (2026-11-17, through the hub wrapper; runs 1-2 were the census's own development):**
  - 68835 edge samples; 394 candidates, 135 walked (the stride, plus 3 seeds);
  - held at the edge: stand:1 47, stand:0.4 60, crouch:1 46;
  - stopped short: 36 / 36 / 37;
  - walls: 50 run, 4 passed. The baseline: a picnic umbrella, `wc06/fence16`, `wc05/di_fence22`, `wc12/di_ext_12a`; today's,
    not judged here.
  - The seeds: z 1269 run DIFFERS, walk MATCH; z 1220 walk DIFFERS.
  - Other spots held at the run include `b3_wc3`'s edges at z 958 (gaps 1.5-1.95 to the road). Under s2's rule a run crosses
    these, once its frame's step exceeds the gap.
- The full census of every map is for a box.

## 7. What proves it

- **Relay-1's rows on r0004** (memory trace, 17 trials, read by the bugs lane, unreviewed): at b2_wc07's top facing -x,
  - the walk HELD 4 of 4 (x 1526.93-1527.00) and crouched;
  - the run OFF 3 of 3 (refused once at 1526.914, then 1.447 to 1525.47, falling the update after);
  - trial (B), the walk at z 1220, relayed as crossing 3 of 3.
  Once a reviewer re-reads those rows, s2's rule at b2_wc07 is proven within the rows' tolerance.
- The bugs lane's prediction (A), a run started at the edge (refused three updates, taken on the 4th), tests the speed kept
  through refusals directly.

## 8. Open points

- s4's list, chiefly the ramp's field through a put-back, the root offset's x/z, and the fall starting an update after
  the step.
- The RED (948a123834) starts from rest at x 1528.0, as the rows' run does. Under the fix it should leave on the 4th frame.
  Its 60-tick window holds that.

## 9. Readings of phase B (LATER 1148; the brief's ruling of 06:49Z)

Added 2026-11-17 with phase B's RED tests (`viewer/test/crossroadsWallTop.test.ts`). The measured cases now stand on the
bugs lane's read of relay-1's rows **after its fresh review** (`bugs/P10-crossroads-rows-read.md`, its section "After the
fresh review", which governs; the review `bugs/P10-crossroads-rows-fresh-review.md`, PASS WITH FINDINGS): 15 top trials.
This corrects section 3 and section 7 where they differ:
- the run at z 1269 leaves the top 5 of 5 (top-run-1..3, edge-run-2/3; edge-run-1, started off its placement, fits);
- the walk at z 1269 is held (4 of 4 standing, crouched too);
- the walk at z 1220 walks off 3 of 3, but narrow-walk-1 is first **held 18 updates** at x 1527.373, 0.6 u short of the
  edge, because its next step's end (1526.656 / 1526.506) lies in the wedge; one idle row, and the ramp restarts.
- the speeds: run 65.0, walk 26.0, crouched walk 14.0 u/s (2.167-2.172, 0.866-0.870, 0.466-0.470 u an update).
- the wedge widths (s1, s3) are the PORT's reading of the disc's collision; the rows bracket the original's edges (the
  review's (c)): the road edge at z 1269.2 between x 1525.485 and 1525.831, at z 1220 between 1526.299 and 1526.506, the
  top's edge between 1526.706 and 1526.768. The fit margins are 0.002-0.08 u, so the tests pin the rows' positions and
  brackets, not the port's own wedge.

The names below are declared in `viewer/src/mover.ts` by phase B (`groundFrameMove`, called from `move` for a ground move
with no AI correction). Two choices of the port's mapping, beside s5:
- **The frames are the throttle's** (`throttleFrameEnds` of the tick's number, as `idleRead` and `throttleFrames` count
  it), so the room and the page end a ground frame on the same ticks; from a placing, ticks 3, 5, 7, ... end frames.
- **The in-between tick** never takes off (s5); where its column has a floor it takes the move, and the floor's y when
  within `ground_touch_distance`, as every ground tick did before: on a slope or a stair the body does not hold its y for a
  tick. **Over no floor it holds its move for the frame's end and the body stays** (2026-11-17, after the box census at
  42550490c1; `GROUND_FRAME_TICKS_READING`): the frame's end probes once at the body plus the held moves plus its own. At
  42550490c1 it stood there for that tick, x/z over the wedge, its y unchanged -- and walked through three walls (s9.2).
- **Only the walk's own tick** (`tick` -> `step60`) takes this path. A move made outside a tick -- the bots' navigation
  probe's `glide` (`match/src/bots/navigation.ts` `clearBody`), never ticked -- or a driver's `glide` (the dive's carry)
  is a whole move and takes `move`'s sub-step path, probed at each part and at its end, as before LATER 1148 (the review of
  42550490c1, finding 3: with the throttle's tick count at 0 after `place`, every glide was numbered tick 1, not a frame's
  end, so never refused over no floor and never taking off; the bots' graph moved).
- **THE GLIDE'S SUB-STEP FLOOR: A NAMED LIMIT, NOT PARITY** (the main controller's ruling of 08:37Z on ffde437bd2's
  departure; LATER 1151: "the bots' graph builder and the dive still use the sub-step floor rule after LATER 1148"). It is
  accepted for now as two named things, and nothing reads either constant (it switches nothing):
  - (a) `NAV_PROBE_SUBSTEP_FLOOR_READING` -- the bots' GRAPH BUILDER's probe glide (`match/src/bots/navigation.ts`
    `clearBody`, its whole-body `probe.glide`), the port's own instrument with no original. Its graph is kept
    byte-identical to the trunk's builder.
  - (b) `DIVE_GLIDE_FLOOR_READING` -- THE DIVE's carry (`viewer/src/traversal.ts`, the driver's `w.glide(dx, dz)`), a
    PLAYER's move. **The original's floor rule for a dive is NOT READ** (whether its carry probes the floor once a frame,
    as the walk's `FUN_005b0840` does, is unestablished); today's behaviour is kept unchanged.
  - **Every caller of the glide path, by source inspection** (`glide` sets `walkTick_` false; `move` takes the frame-end
    path only with `walkTick_` true, on the ground, with no AI correction): `Walker.glide`'s callers in the port's
    sources are those two alone. Kept old, beside them: **the AI's corrected move** (`move` with `correct`, which only
    `glide`'s and `glideAi`'s callers pass; no source caller passes one to `glide`) keeps the sub-step path by the `!correct`
    test. **Not on it**: `glideAi` (the hostage follow, `match/src/hostageFollow.ts`, and the probe's centre-line test,
    `LEG_WALLS_CENTRE_ADAPTATION`) takes its own one-endpoint floor (`groundEndpoint`) on the ground and the air's step in
    the air, untouched by LATER 1148; the turret mount's steer (`viewer/src/net/emplacement.ts`) calls `glide` only for a
    mover without `grid`, never a `Walker` (it takes `steerMove`); the slope slide's and the walk's moves (`move` from
    `step60`) are inside the tick; the ladder and the climb (`./traversal` drivers) set the body's place themselves; the
    spawn drop and a blast's knock (`Walker.knock` sets the body in the air) take the air's step, and the push of the
    body's contacts is part of the tick's own move. The disc arm (`WALL_BODY_READING` not
    'segments') keeps the sub-step rule whole (the third deviation below).
  - **THE MISMATCH**: the bots now WALK by the frame-end rule (their walk is the walk's tick), but their graph was built by
    the sub-step rule, so an edge the graph calls walkable may hold or drop a bot differently than before (a frame's end
    refusing where a sub-step was taken, or taking where one was refused). **So the bot soak tests are a gate at this
    head, compared with the trunk's own numbers**: `botSpawnProgress`, `botOpeningPoints`, `frostfireOpenings`, `botTrace`
    and `botNavBudget` on the box's graph.
- **The retry's idle frame**: from the frame end of the `refused`-th miss to the next frame end the body does not move,
  the ground state is idle and the ramped stick is at rest, so the next tick's ramp starts from rest.
- **Three deviations of the 60 Hz tick**, declared (the review of 42550490c1, findings 6, 8, 11): (a) the walls are met on
  each tick's move, not once on the frame's (`GROUND_WALLS_PER_TICK_READING`); (b) a frame's step is two or three ticks'
  moves (`GROUND_FRAME_TICKS_READING`) -- about one frame in 500 spans three, and **the first frame after a placing always
  does** when the ticks are counted from it (`throttleFrameEnds(2)` is false: the frame is 2.002 ticks), so a walk from a
  placing makes a bigger first step than the rows' (crossroadsWallTop's z 1220 walk numbers its ticks from 2, as the room's
  and the page's command numbers can, for the rows' phase); (c) **the disc arm** (`WALL_BODY_READING` other than
  'segments') keeps the old sub-step floor rule entirely -- `MAX_SUBSTEP`'s parts each slid and refused over no floor.
- **The axis-split retry is gone from the walk's ground tick** (the review's finding 5; `GROUND_AXIS_RETRY_READING`
  'none'): the old `step` tried a refused part again along x, then along z, so a body pressed diagonally into a floorless
  edge slid along it (z 87.71 after 120 ticks on a plain floor); a refused frame is now put back whole, as
  `FUN_005b0420`'s miss (D:L467091-467103), and the body stops dead (z under 12; `walk.test`, red on the pre-phase-B
  mover).
- **What a held body looks like** (the review's finding 12): at 42550490c1 a body held at a floorless edge poked past it by
  up to a tick's move every other tick (1.0 u in walk.test, 2.3 u at (1526.76, 1355.78)), the in-between tick standing
  over no floor and the frame's end putting it back. With the in-between tick's move held over no floor (above) it no
  longer does: the body stays at the last hit. The original shows none either (one position an update).
- **The first step from rest** (finding 9; `GROUND_FIRST_STEP_READING`): after the retry's restart, or from a placing, the
  rows' first frame steps 0.358 u at the walk, the port's 0.268 (its ramp, `throttleRamp`): a named difference, not tuned.
  top-walk-2's 11-update hold ended by a 16.7 ms half-step and no idle row is not the retry (`GROUND_HALF_STEP_READING`,
  unmodelled); the retry's measured range is 17-18.


| name | what it stands for, and its source | the evidence that would settle it | status |
|---|---|---|---|
| `GROUND_FLOOR_PROBE_READING` | `'frame-end'`: the ground walk's floor tested once a game frame, on the tick that ends it, at the position the frame's whole step reached (s2 items 1, 3, 4; `FUN_005483d0` D:L413918, `FUN_005b0840` D:L467215-467256, `FUN_005b0420` D:L467055-467103); `'sub-step'` the old rule (each `MAX_SUBSTEP` part refused), kept for the census. | a capture of the probe's origin against `+0xf54` each frame (research 399 s7) | reading, pending review; declared in `viewer/src/mover.ts` (phase B) |
| `GROUND_RETRY_REFUSALS_READING` | THE RETRY CYCLE: after a run of refused frames, ONE idle frame (action 1) and the speed ramp restarts from rest (the original's 0.36 u); after a FEW (the run's three) the ramp goes on. Measured range of the holds that end in the idle row: **17-18 refused updates** (top-walk-stand-1 17 then the idle row r50; narrow-walk-1 18 then the idle row r54); top-walk-2's 11, ended by a 16.7 ms half-step and no idle row, is `GROUND_HALF_STEP_READING`, not this. WHAT SETS THE COUNT IS NOT READ: the writer of the action word to 1 after refusals has not been looked for. Built at **18**, narrow-walk-1's (the case the RED pins), within the range; not tuned. | the code that idles the ground state after refusals (the action word `+0x534` written 1 while the stick is held), or a trace counting the refusals before the idle row over more trials | reading, pending review; declared in `viewer/src/mover.ts` (phase B) |
| `GROUND_PUT_BACK_READING` | finding 2: a miss puts x/z back at the LAST HIT's point (`+0x400..+0x408`, written from the hit record D:L467123-467143; read back by `FUN_003157d0` D:L467099), not an assumed previous frame end. The port stores the hit's point, which is the probe column; the column is the feet (the root offset's x/z taken as 0, s4). | the root offset's x/z (D:L467221-467251) in a walk and a run, from a capture | reading, pending review; declared in `viewer/src/mover.ts` (phase B) |
| `GROUND_SPEED_KEPT_READING` | finding 5: what keeps the speed through a refused frame is NOT SHOWN (`+0x2c` is rewritten from the clip every frame, D:L438910, D:L438985; the miss branch writes neither it nor the animation; the vtable `+0x10` at D:L467100 is not followed). No carrier is invented: the port keeps its own velocity and stick ramp through the put-back (only `stopSlide`, as the air). | the clip/blend state across a refused frame in a trace; the vtable `+0x10` followed | reading, pending review; declared in `viewer/src/mover.ts` (phase B) |
| `GROUND_FRAME_TICKS_READING` | finding 6, a declared port deviation: a game frame is 2.002 ticks (`GAME_FRAME_DT` / `TICK`), so about one frame in 500 spans 3 ticks, and the first frame after a placing always does when the ticks are counted from it (`throttleFrameEnds(2)` false; the review's finding 8); the frame's step is then three ticks' move (the original's step is one frame's displacement, D:L413918). A tick between frame ends whose move ends over no floor holds it for the frame's end (the body stays), so no tick stands where no frame's move ends (s9.2). The frames are the throttle's (`throttleFrameEnds` of the tick's number), so the room and the page end them alike. | none: a property of the port's 60 Hz tick (MISSION R8) | reading, pending review; declared in `viewer/src/mover.ts` (phase B) |
| `GROUND_WALLS_PER_TICK_READING` | BUILT 'per-frame' since LATER 1194 (s10; MISSION R8's 2026-11-18 exception): the walls met once a game frame on the frame's move from its start (`frameWalls`); 'per-tick' is the rule below. Finding 6 (the 'per-tick' arm), a declared port deviation: the walls are resolved on each tick's move (`resolveSegments`, `MAX_SUBSTEP`'s wall guard), not once on the frame's whole displacement as the contact loops do (D:L413409-413900). The in-between tick's x/z is taken only over a floor (`GROUND_FRAME_TICKS_READING`); a tick with a move held runs the walls on the held move and its own as ONE move from the body (d3e927436b; the re-review of e9d8e8c0ee, finding 1; the main controller's ruling, the original's one move a frame, `FUN_005483d0` D:L413918), so no tick takes the body further than the frame's wall-shortened move. | none: a property of the port's 60 Hz tick | reading, pending review; declared in `viewer/src/mover.ts` (phase B) |
| `GROUND_FRAME_ONE_ACTION_PLACEHOLDER` | s10 (LATER 1194B), the candidate's (a): at 'per-frame' a frame whose ground ticks ran under two actions (the page's ticks start an action mid-frame: a crouch run's release starts 0x11 on the frame's second tick) is met on the last tick's move over the frame's ticks, not the sum; the original's one displacement a frame under one action (`FUN_005483d0` D:L413918; every line's end carries it, `FUN_0054aa30` D:L415455, D:L415522). crouchRunRelease's end 13.929 -> 12.846 (capture 12.88). | a capture of an action started mid-frame against a wall; which action owns a mixed frame is the port's tick model's question (the original has no ticks in a frame) | placeholder; declared in `viewer/src/mover.ts` |
| `PRESS_FRAME_READING` | LATER 1219 (the owner's ruling, 2026-11-21: "movement presses at the next game-frame boundary approved"): a pad's press of the move stick from rest is read at the next game frame's start (`'frame-start'`), as the original copies the pad's axes into the actor once an actor tick before the driver (`FUN_00551ec0` D:L418613-418615) and the actor ticks once a 30 Hz frame. A tick that does not start a frame and whose last read was at rest takes that rest read again (`Walker.idleRead`); only the mover's stick is held, never the look, the camera, a button or the weapon. `'at-once'` (the port before it, and the test build's playtest instrument `Walker.pressFrame` false): the press read on its own 60 Hz tick, so at MP81 a press after 30 still ticks slid along the far wall where one after 31 held. A browser adaptation of the read's window, as IDLE-FRAME's (MISSION R8.1). `pressFrame.test.ts`. | a capture of a press against the original's frame clock (the pad's edge time beside the first moved frame), on the rig | reading, pending review; declared in `viewer/src/mover.ts` |
| `GROUND_HALF_STEP_READING` | the review's finding 9: top-walk-2 held 11 updates, then a 16.7 ms half-step and no idle row -- a way off a hold the port does not model; what makes the half-step is unread. | the code or a trace of the half-step's update | reading (measured once in the rows), unmodelled; declared in `viewer/src/mover.ts` |
| `GROUND_FIRST_STEP_READING` | the review's finding 9: the first frame's step from rest at the walk, the rows' 0.358 u (narrow-walk-1..3), the port's 0.268 (its stick ramp, crossroadsWallTop's z 1220 walk numbered from 2); a named difference, not tuned. | the original's ramp's first frame read (`FUN_00586c10`), or the port's ramp re-measured against the rows | reading; declared in `viewer/src/mover.ts` |
| `GROUND_AXIS_RETRY_READING` | the review's finding 5: `'none'` -- the walk's ground tick has no per-axis retry; a refused frame is put back whole (D:L467091-467103), so a diagonal walk into a floorless edge stops dead (`walk.test`), where the old `step` slid it along the edge. | a capture of a diagonal walk into a floorless edge | reading, pending review; declared in `viewer/src/mover.ts` |
| `WALL_SWEEP_PUSH_READING` | finding 4: `FUN_00516f10` (D:L413925-413940) is a CAPPED PUSH onto `+0xf54` (cap `DAT_0064fd20`), not a shortening of the move (s2 item 2 said "shortens"; corrected). Not built: the port's wall handling stays as it is and `MAX_SUBSTEP`'s wall guard stays. | `FUN_00516f10`'s test read, and whether its gate (D:L413920-413922) opens for a player | reading, pending review; declared in `viewer/src/mover.ts` (phase B) |
| `NAV_PROBE_SUBSTEP_FLOOR_READING` | LATER 1151, a named limit, not parity: the bots' graph builder's probe (`navigation.ts` `clearBody`, `glide`) moves outside the walk's tick and keeps `move`'s sub-step floor rule, its graph byte-identical to the trunk's; the bots walk by the frame-end rule, so the graph and the walk disagree at an edge (the mismatch above). The port's own instrument, no original. | the bot soak tests at this head against the trunk's numbers; the builder moved to the walk's rule once the graph's edges are re-measured | reading (the port's instrument, kept old); declared in `viewer/src/mover.ts`, read by nothing |
| `DIVE_GLIDE_FLOOR_READING` | LATER 1151, a named limit, not parity: the dive's carry (`traversal.ts`, `glide`), a player's move, keeps `move`'s sub-step floor rule. The original's floor rule for a dive is NOT READ; today's behaviour kept. | the dive's carry read in the decompilation (its floor probe, per frame or per part), or a capture of a dive off a narrow edge | reading (the original unread, kept old); declared in `viewer/src/mover.ts`, read by nothing |
| `GROUND_PROBE_ORIGIN_Y_READING` | finding 1: the probe origin's y `+0xf58` is overwritten before the probe by `FUN_0059afd0` (D:L413944-413947: the altitude, unless the state word is 10 and `DAT_003dee80`'s test fails), then raised to `DAT_0066aab8` (D:L467218-467220). The port probes from the feet + `probeLift`, as the walk's pick always has; the difference is named, not followed. | the altitude `+0x2e4` beside `+0xf58` on a level walk, from a capture | reading, pending review; declared in `viewer/src/mover.ts` (phase B) |


### 9.1 The census with phase B (M; MP72 only, on the hub, 2026-11-17; every map is a box leg)

- Before (the merged tree, `GROUND_FLOOR_PROBE_READING` not yet built): held at the edge stand:1 47, stand:0.4 60, crouch:1
  46; stopped short 36 / 36 / 37; walls 50 run, 4 passed (the picnic umbrella `b4_wc02_tables/table_picnic_umbrella`,
  `wc06/fence16`, `wc05/di_fence22`, `wc12/di_ext_12a`: today's port, a separate finding, not touched here).
- After: held 15 / 48 / 14; stopped short 37 / 37 / 38; walls 50 run, 4 passed, NEWLY PASSED 0; newly held 0 in every gait.
- The seeds: z 1269 run left (MATCH), z 1269 walk held (MATCH), z 1220 walk left (MATCH).
- No longer held: 32 (stand:1), 12 (stand:0.4), 32 (crouch:1, which runs standing at full stick), among them `b3_wc3`'s
  edges at z 958 (gaps 1.1-1.95, under a run's frame step) and `b3_wc2`'s roof (gaps 0.35-0.5, at the walk).
- The one candidate whose class moved to `short`: `b2_wc07` at (1526.76, 1355.78), a 2 u wedge, in every gait. Corrected
  (the review of 42550490c1, finding 6, its trace): the body never leaves its start; the segment push takes it to z
  1357.844, 0.014 u past the top's north edge, and each frame end puts it back (the 139.6 u/s tick is that put-back); the
  retry at ticks 38-39 changes nothing. **UNMEASURED** in the original: no row walks there.
- **Changed by phase B and UNMEASURED** (the review's finding 10; no row of the original walks them): `b2_wc06` at x 1869.95,
  z 1028-1152 (13 positions) and four positions at z 1357.83; `b2_wc07`'s north edge at x 1537.06, 1549.41 and 1561.76;
  `b2_wc07/diext3`, the `b3_wc3` awning, `wc06/di_ext16_4` and `wc21/di_roof21`, beside `b3_wc3`'s edges at z 958 and
  `b3_wc2`'s roof above. The `b3_wc2` roof, the awning and `di_ext16_4` cross onto a floor 0.6-3.1 u HIGHER, a crossing the
  rows never measured (theirs are drops). From the census (s9.2): MP8 `land49/g3372`'s edge at (673.51, 1327.46), by
  `land49/g3373`'s base, newly held at the walk (stand:0.4: held at 0.26 at 42550490c1, the box's `N-census-AFTER.log:35`;
  held at -0.17 at d3e927436b, the hub's `MP8-census-d3e927436b.log:11`); MP10 `g13090_2` at (1536.19, 357.57) and
  `underwater_15` at (1710, 805.67), newly held at the walk (stand:0.4: held at -0.12 at 42550490c1, the box's
  `N-census-AFTER.log:48` and `:50`; held at -0.12 at d3e927436b, the hub's `MP10-census-d3e927436b.log:6` and `:8`). Each
  is a hold the frame's end makes where the walk's next frame ends over no floor; none is measured.

### 9.2 The walls the in-between tick walked through, and the fix (M, D; 2026-11-17)

The box census at 42550490c1 (`agent-mail/evidence/weekend-mega-2026-11-14/box/later1148-42550490c/keep/`, every map,
against the trunk 1339936db3) found three walls NEWLY PASSED: MP51 `wall3234/-1` (`worldmodel/wc16B`, from (1627.32,
1142.76)), MP52 `wall1786/-1` (`mp52_railcar01/g2209_2`, from (3788.8, 2390.67)) and MP52 `wall1938/-1`
(`mp52_railcar01b/g2209_2`, from (3814.79, 2292.64)). Traced on the dev disc (old mover beside new): each face is met from
behind its own normal, where the body's segments do not meet it (the hull's hit is one-sided, research 281 s4.3); the floor
ends at the face. Before phase B the sub-step was refused there (held at d -0.04 from the face). At 42550490c1 the walk
reached d -0.04 on a frame end (tick 10), and the next tick, between frame ends, took its 1.08 u move whole over no floor
(`groundFrameMove`'s in-between branch) to d +1.04, past the face -- the census's crossing; the frame's end then put it
back. The coordinator's MP8 trace (`land49/g3373`'s leaning base, a run at 65 u/s) is the same branch: the feet stood
1.1 u inside the base for a tick, every other tick. The fix: the in-between tick takes its move only over a floor; over none
it holds it for the frame's end (s9, `GROUND_FRAME_TICKS_READING`); the walls stay per tick, a held move met with the tick's
own as one move from the body (d3e927436b, `GROUND_WALLS_PER_TICK_READING`; `viewer/test/walk.test.ts`, a crack before a
wall: the stand-off no nearer than with no crack, red at e9d8e8c0ee, 4.31 against 5.39). Held by
`viewer/test/groundFrameWalls.devdisc.test.ts` (the three walls by the census's own walk, and the MP8 run: no grounded tick
ends over no floor), red at 42550490c1.

The census after the fix (on the hub, one map a run, `P1_BASELINE` = the box's census-before.json at the trunk):

| map | walls passed (before / at 42550490c1 / after) | newly passed | held stand:1 / stand:0.4 / crouch:1 (before -> after) |
|---|---|---|---|
| MP51 | 0 / 1 / 0 | 0 | 0 / 4 / 0 -> 0 / 1 / 0 |
| MP52 | 4 / 6 / 4 | 0 | 1 / 12 / 1 -> 0 / 1 / 0 |
| MP72 | 4 / 4 / 4 | 0 | 47 / 60 / 46 -> 15 / 48 / 14 |
| MP8 | 0 / 0 / 0 | 0 | 4 / 5 / 5 -> 1 / 6 / 1 (newly held 1, stand:0.4) |
| MP10 | 2 / 2 / 2 | 0 | 3 / 8 / 3 -> 0 / 3 / 0 (newly held 2, stand:0.4) |

No candidate is newly held in any gait on MP51, MP52 or MP72. The other maps were not re-run after the fix (a box leg).

MP8 and MP10 again at d3e927436b (the held move wall-tested with the frame end's move as one move, the re-review of
e9d8e8c0ee, finding 1), on the hub, one map a run, `P1_BASELINE` = the box's census-before.json; the logs are
`agent-mail/evidence/weekend-mega-2026-11-14/core72c5/later1148-census/MP8-census-d3e927436b.log` and
`MP10-census-d3e927436b.log`:
- **MP8**: walls 54 run, 0 passed, NEWLY PASSED 0; held 1 / 6 / 1 (newly held 1, stand:0.4), as in the table.
- **MP10**: walls 48 run, 2 passed (`wall192/1`, `wall864/1`, as before), NEWLY PASSED 0; held 0 / 3 / 0 (newly held 2,
  stand:0.4), as in the table.

**The census's speed at d3e927436b, and the held tick (M; 2026-11-17).** The census's speed is the fastest single tick's
displacement x 60 (`floorlessEdgeCensus.devdisc.test.ts` `walkOff`), so its MP10 "left at 2.04 @124.58 u/s" (42550490c1:
65) is a real displacement of the body on one tick, not a sampling effect: a per-tick trace (dev disc, MP10's candidate
at (1536.19, 238.27, 357.57), stand:1 from 4.5; `agent-mail/evidence/weekend-mega-2026-11-14/core72c5/later1148-traces/
per-tick-trace-d3e927436b.log`) has the body still on ticks 9-11 (tick 9 held, tick 10's frame end a miss put back at
the last hit, tick 11 held) and moving 2.1667 u on tick 12, the frame end, onto the far floor; 124.58 is a tick whose
held move was taken during the ramp (0.993 + 1.083 u). It happens only where a tick between frame ends would end over
no floor: over solid floor every tick moves 1.0833 u (65 / 60), none held. A hold lasts the frame's ticks before its end:
one in a frame of two ticks, two in a frame of three (every 985 ticks, ends at n 986, 1971 ...; and the first frame
after a placing), whose end then steps 3.25 u (`three-tick-frame-trace-d3e927436b.log`) -- the declared deviation of
`GROUND_FRAME_TICKS_READING`. The page draws the walker and the camera between the last two ticks' states (`Walker`
`tickFeet`, `PlayerCamera.view(alpha)`), so it draws the body still for the held tick and crossing the frame end's step
over the next; at an edge held by the frame end (its probe in the gap) while the tick between lands on floor, the body
steps one tick's move out and is put back on the next, tick after tick (the same trace, crack 0.6 from x 90: 98.125 <->
99.208) -- fixed since, s9.3. The room never refuses a move: it runs each command on its own `Walker` (`match/src/room.ts`, `p.sim.apply`),
so it takes the same still tick and the same step. Held by `viewer/test/walk.test.ts` (over solid floor no held tick;
at a crack the held ticks and the frame end's step bounded by the frame's ticks) and
`match/test/heldFrameEndRoom.test.ts` (the room's mover takes a still command then the 2.17 step, the page no correction).

**The newly held bodies, by position, for a rig look** (each **UNMEASURED**: no row of the original walks there). The
positions are the census's candidates (x, y, z of the edge sample; n the edge's outward normal in x/z; the gap to the far
floor), as `N-census-AFTER.log` of the box's census at 42550490c1 lists them
(`agent-mail/evidence/weekend-mega-2026-11-14/box/later1148-42550490c/keep/`); the hub's census after the fix counts the
same newly held numbers (MP8 1, MP10 2, all stand:0.4) -- its positions not re-listed here:
- **MP8**, stand:0.4: `worldmodel/land49/g3372`'s edge at (673.51, 105.90, 1327.46), n (0.08, 1), gap 2.1, far y 105.9,
  walked from 1.5, beside `land49/g3373`'s base (held at 0.26 at 42550490c1, `N-census-AFTER.log:35`; at -0.17 at
  d3e927436b, `MP8-census-d3e927436b.log:11`; the trunk: stand:0.4 left at 2.44).
- **MP10**, stand:0.4: `worldmodel/g13090_2`'s edge at (1536.19, 238.27, 357.57), n (1, 0.09), gap 1.75, far y 232.9,
  walked from 5 (held at -0.12 at 42550490c1, `N-census-AFTER.log:48`, and at d3e927436b, `MP10-census-d3e927436b.log:6`;
  the trunk: left at 1.85).
- **MP10**, stand:0.4: `worldmodel/underwater_15`'s edge at (1710, 5, 805.67), n (0.09, -1), gap 1.85, far y 24.99,
  walked from 5 (held at -0.12 at 42550490c1, `N-census-AFTER.log:50`, and at d3e927436b, `MP10-census-d3e927436b.log:8`;
  the trunk: left at 2.07).

### 9.3 The held-edge jitter, fixed; the 30 Hz step, named (D, M; 2026-11-17; reading, pending review)

**The jitter.** At 8988c2eba3, where the frame end's probe point lands over no floor but the tick between two frame ends
lands on floor, `groundFrameMove` took the in-between tick's move and the frame end put it back at the last hit -- a step
out and back every frame. The synthetic case (a 0.6 crack, floor to x 100, a run from x 90): x 98.125 <-> 99.208. The
real spot: crossroadsWallTop's held walk on MP72 `b2_wc07`'s top (z 1269.2, from x 1528, the walk's stick 0.4, 312
ticks; dev disc fixture `RUN/MP72.ZDB`) was held at every frame end as the rows have it, but SHOOK between ticks: standing,
ticks 4-39 alternated 1527.0305 (the in-between tick) and 1527.4638 (the frame end's put-back), ticks 42-79 1526.7624 and
1527.1957, then it stood at 1526.9276 with a one-tick 1526.8382 every 38 ticks (122, 160, 198, 236: the ramp after the
retry's idle frame); crouched, 1526.8417 and 1527.0750 -- 82 and 47 changes of direction. The original makes one move a
frame (`FUN_005483d0` D:L413918) and its rows hold one x an update while held (1526.93-1527.00, s3).

**The fix** (the main controller's ruling of 09:3xZ, the same rule as the wall ruling of s9.2: no tick shows a position the
frame end will not keep): an in-between tick ALSO holds when the frame end's probe point would be over no floor, so the
body stands until the frame end decides (`groundFrameMove`; `GROUND_FRAME_TICKS_READING`). The probe point is the port's
prediction: this tick's share of the frame's move continued to the frame's end (one tick more; two on a 3-tick frame's
first), changed each tick by as much as it changed since the last tick (the speed ramp: with this tick's move alone a
ramping body still stepped out, 99.028 -> 99.479 -> 99.028 at the 0.6 crack), the command assumed to stay. A frame end
probes at the body plus the held moves plus its own whether the tick between took its move or held it, so the hold
changes the frame end's probe POINT in no case. It changes a frame end in two ways only: the walls (resolved from the
body), and the height the frame end's floor and take-off tests start from (`groundEndpoint` against `s.y`, which a taken
in-between tick raises and a hold leaves at the frame's start): on a slope meeting a floor about one probe lift (~10.6 u)
higher, or a drop near the touch distance, a held frame tests from the frame-start body -- the original's one move a frame
(the re-read of c294199fdb; the census on the five hub maps found the held sets and walls the same). A prediction too long
only holds a tick the frame end then crosses whole. After it the z 1269 walk has no change of direction in 312 ticks: standing it
stands at 1527.4638 (ticks 3-41), 1527.1957 (43-81), 1526.9276 (83 on); crouched at 1527.0750 (9-47), 1526.8694 (51 on).
Held by `viewer/test/walk.test.ts` (cracks of 0.3-2.1 u: walking +x, x never decreases; red at 8988c2eba3 on the 0.6 crack
from x 90, tick 14, 99.208 -> 98.125) and `viewer/test/crossroadsWallTop.test.ts` (the z 1269 held walk, standing and
crouched: walking -x, x never increases; red at 8988c2eba3, standing tick 5, 1527.1063 -> 1527.4638).

**The sill fault, fixed** (D; 2026-11-18; reading, pending review). At c27fffce4f an in-between tick over a floor more than
`groundTouchDistance` below -- a drop the frame end decides (a take-off, or a gap it crosses whole) -- still took its
move, at the frame-start height, past the edge. On Desert Glory's SEAL-building window sill (MP6 `mp6_window_wide`, sill y 11.5, lintel 24.5, the room floor 0)
a crouched walk off the sill so stood for one tick under no lintel, where the crouch run's headroom let it stand, and fell
standing (head line stand:17.830, `airHeadLineDisc.test.ts`). The original reads its ground at the frame's start
(`FUN_00550570` -> `FUN_005b0420`, D:L417768-417771, s2.4) and makes one move a frame (`FUN_005506a0`, D:L417804-417826,
s2.1), and r0004's sill rows (relay-1, LOOK 1; `bugs/P10-sill-rows-read.md`,
unreviewed: crouched 5 of 5 keep stance 1 through the fall, prone 6 of 6 stance 2) keep the stance word in the air (the
head line in the air is not logged there). A gap deeper than the touch distance mid-frame, with the frame end on its far
side, now also holds the tick between and the frame end crosses whole (the same probe point and height; only the walls are
met from the frame-start body, as above). The fix,
the same rule (no tick shows a position the frame end will not keep): the in-between tick ALSO holds when its own floor
or the frame end's probe point's floor is more than `groundTouchDistance` below the body (`groundFrameMove`). A taken
in-between tick now always lands on its floor. The crouched line off the sill is crouch:12.138 again, prone 5.637
(dev-disc, red at fd5e05b700, green after). Two rests the port's own values pinned move with it (research 80 s7): MP64
respawn 181 takes off at the first game frame's end (the third tick) and rests where it did, (1391.30, 9.321,
2438.80); MP8 respawn 0/326 falls to `land36/g3344` at (1065.58, 18.965, 475.77).

**The census with the fix** (dev disc, on the hub, one run of MP51, MP52, MP72, MP8, MP10; `P1_BASELINE` = the box's
census-before.json at the trunk; `agent-mail/evidence/weekend-mega-2026-11-14/core72c5/later1148-census/census-63543d8473.log`):
the same counts as s9.2's table after the fix, walls NEWLY PASSED 0 on all five, newly held MP8 1 and MP10 2 (stand:0.4).
The same census with 8988c2eba3's mover against the fixed one (`census-8988c2eba3-mover-vs-63543d8473.log`): every held set
and every wall the same -- the fix moves no frame end, as above.

**The room, a three-tick frame.** `match/test/heldFrameEndRoom.test.ts`: the room numbers its ticks by the command's seq
(`net/moverSim.ts` sets `commandSeq` from `cmd.seq`), so a placing does not restart its count (the first frame after a
placing spans three ticks only on the `Walker`'s own count); its three-tick frame is seqs 984-986. A run whose seq 984 and
985 moves end over a moat takes two still commands and then 3 x 65 / 60 = 3.25 u on seq 986, the page with no correction.

**The 30 Hz step (named; it stays).** Near a floorless edge the body and the camera stand still on a held tick, then cross
the whole step on the next: the port's mapping of the original's one move a frame (`FUN_005483d0` D:L413918; a game frame is
2.002 of the page's 60 Hz ticks, `GROUND_WALLS_PER_TICK_READING`) onto a 60 Hz page. Over solid floor no tick is held
(1.0833 u every tick at the run, walk.test). A draw-side smoothing -- the page interpolating the held step, an adaptation
that changes no game state -- is a product-track row, LATER 1152, not built here.

## 10. LATER 1194B: the release path under the per-frame walls (D, M; coreB, 2026-11-20; reading, pending review)

*Why LATER 1194's per-frame walls (`GROUND_WALLS_PER_TICK_READING` 'per-frame', efbc0fe783 = e4ccb86ea2 on next
5e03075922) put `crouchRunRelease` (LATER 678) out to 13.93 for the capture's 12.88, and stop `m51DitchBlock`'s slide.
Evidence kinds kept apart: D = the decompilation read (`socom2_game.elf.decomp.c`); M = a headless trace of the port (a
scratch copy of `viewer/test/crouchRunRelease.test.ts` with a per-tick print in `frameWalls`, run once on the hub, not
committed, the worktree restored); T = what a test's own header cites. Nothing here is a capture comparison of new
rows, a box run or a browser run; no disc on this host, so no dev-disc test was run.*

**The cast (D).** `FUN_0054aa30` builds each line's end as the node (`+0x28`'s `+0x30`, the frame's start) plus its
reach plus the whole displacement `+0xf44` (the centre line: 1.1 x 1.4 x 3.5 along the move, D:L415166 and
D:L415235; the head line's end plus `+0xf44` at D:L415455 and D:L415522). The head line takes the muzzle reach -- 1.1 (0x3f8ccccd) times the
fire point `+0x14b0` (`piVar17[0x52c..0x52e]`) along the row `+0x20` -- when the body is still (`+0xf44..+0xf4c` all
under 0.0005, D:L415008-415019) or the row `+0x20` dotted with the move's unit direction is under 0 (-0.2 under action
8/9 or the knock), and one of: the weapon's flag 0x40 with `+0x458` live and the posture word not 5, the posture word 2,
or action 0x11 / 0x13 / 0x19 on the stack (D:L415471-415482). A still body casts along minus that row (D:L415140),
which the port takes as the facing; so the row is the back, and a forward move also qualifies: the arm is not gated on
stillness for a release made facing the wall.

**The resolution (D).** `FUN_005483d0`, per kept hit: on the ground the displacement loses its whole part along the
levelled normal (D:L413557-413567); the deepest depth (the line's end behind the face, gathered only for a controlled
body, D:L413569-413587) over 1 either jams (more than two hits, or `bVar6`: actions 0x1a/0x1b/0x1c, `DAT_003decc0`/`DAT_003decd0`, or the posture word 2,
D:L413480-413502: the node back to the tick's start, `+0xf44` zeroed, D:L413602-413609) or adds the depth less 1 along that normal
(D:L413610-413614). So the push-out on a line whose end includes the displacement puts the body where that end lies 1
behind the face, AND the displacement's part into the face is slid away: a body still moving into the face by P is put
out to reach + P - 1, not reach - 1. That is the original's arithmetic, not the port's error.

**The 13.93, traced (M).** Per frame, the crouch run presses at a rest of 7.476 off the wall (per tick 5.806; the
capture 5.85): every frame cast from 7.476 with its 2.167 meets the face 0.08 deep and is slid to 0 (`met` 0). The
release's first tick (n 361) is a frame END: the frame's raw moves are the pressed tick before it (1.083) and the
released one (0), so the cast carries P = 1.083; the 0x11 head line's fixed muzzle reach (`CROUCH_RUN_RELEASE_PUSH_READING`
'first-tick', 12.58) meets the face 6.19 deep, the slide strips P, the put-out adds 5.19 and the body goes to
12.58 + 1.083 - 1 = 12.665 at once (per tick: 11.58, P = 0). The clip's root then carries -0.035 a tick for 36 ticks
(1.264), 12.665 -> 13.929 (per tick 11.58 -> 12.846). The overshoot is exactly one pressed 60 Hz tick of the run.

**What that says about the per-frame rule.** The overshoot is two port departures meeting, not the frame cast itself:
(i) 'first-tick' pushes on 0x11's first frame, where ac's capture holds 5.85 for four frames and pushes on the fifth,
when its logged velocity is under 0.4 u a frame (R217 s2.9) -- so the original's P at its push is at most about 0.4;
(ii) the port's frame mixes two commands (a pressed tick and a released one; the page reads the stick every 60 Hz
tick), where the original reads one displacement a frame. The rest (7.476 against 5.85) is the frame's phase: a pressed
body stops where the centre line first crosses the face, anywhere in (5.39, 5.39 + the frame's move] -- (5.39, 7.56]
per frame at 65 u/s, (5.39, 6.47] per tick -- and the test's REST_TOLERANCE is stated on one 60 Hz move. The capture's
5.85 lies inside both bands; which phase the original was in is the capture's approach frames, not read here (as
MP81's 31 still ticks, e4ccb86ea2).

**The ditch (T, D).** `m51DitchBlock.disc.test.ts`'s slide assertions (`zMax <= 841.5`, `z < 838`, "the slide runs -z,
as the original's (843 -> 834)") rest on the r0001 EPH replays (its header: their `record.json` says r0001). The same
header cites ac's r0004 ditch capture (proven, a memory trace of the original running): from (990, -140, 841.5) held
right the body STALLS at (982.40, -150.84, 841.50), moving 0.00 u/s. Per frame the port ends at z 840.35 with no slide
-- 1.15 from r0004's stall, where per tick it slid below 838. All three reds of the file are that one assertion: the
offer test and the walk-out call the same `push()`, which throws at it first. The file's own GAP (LATER 690) names the
60 Hz wall step as a cause and the 30 Hz step as the fix. So the ditch red is a stale r0001 pin, moved TOWARD the r0004
capture, not away.

**A candidate rule (a hypothesis only; to be measured on the runner's boxes).** Keep the per-frame cast (1194 as built)
and add: (a) the frame's wall cast takes ONE command's displacement -- the frame-end tick's move over the frame's ticks,
not the sum of ticks under different commands -- the original's one displacement a frame (`FUN_005483d0` D:L413918);
predicted: the release from 7.476 to 11.58, end 12.846 (the capture 12.88); (b) `crouchRunRelease` started on the
capture's frame phase (its approach frames, owed) so its rest falls where the capture's does, the tolerance kept;
(c) `m51DitchBlock`'s slide assertions re-pinned to the r0004 capture's stall (z 841.50), then its offer and walk-out
tests measured for the first time under per-frame. NOT READ: weaponLine (iii) M51 g19733 (7.15 for 6.30-6.73) and
crossroadsWallTop MP72 (run 52.0 for 65.0) -- the rule above says nothing of them, so it is not shown to pass all four.
`CROUCH_RUN_RELEASE_PUSH_READING` stays 'first-tick', reading, known to differ from the capture; its four frames are
owed the fire point `+0x14b0` through 0x11 (RDRAM), not a tuned delay.

**Verdict.** Nothing read here says the per-frame cast is wrong: of the four B reds, the release overshoot is
'first-tick' and the port's mixed-command frame meeting the original's own put-out arithmetic, and the ditch is a stale
r0001 pin that per frame moves toward the r0004 capture. Two B reds (weaponLine, crossroads) are unread; no box until
they are.

**The other two B reds (coreB, 2026-11-20).**
- *crossroadsWallTop MP72, run 52.0 (M: the committed fixture `RUN/MP72.ZDB`, the speed case alone, a print added and
  removed, 2.76 GB free).* The run's x by tick: 13 1541.378, 14 1540.295, 15 1539.212, 16 1538.128, 17 1537.045,
  18 1537.045. Ticks 13-17 are 1.0833 a tick, 65.0 u/s exactly, the rows' 2.167 an update. Tick 18 does not move. The
  per-frame cast reaches the frame's predicted move (2.17) past the line's reach, so the face at x 1535.6 is met one tick
  sooner than per tick. The window 13-18 was chosen "before the face" for a cast that reaches one tick's move. The rule
  does not change the speed; the test's window now reaches the face. Fix: end the window a tick sooner (13-17), or
  further from the face.
- *weaponLine (iii) M51 g19733 +-30, closest 7.15 (T; M51 is the disc, not on this host, not run).* The test's own header
  says a single start is "a phase draw": the stand-off is a sawtooth one wall step wide over where the walk starts
  (+-60 and square are already swept over 13 starts for that reason; +-30 kept one start, "window luck"). Per frame the
  step is a frame's move, about twice a tick's: the stop can fall anywhere up to that much past the reach, about 0.9
  normal to the face at 30 degrees and stick 0.5 against about 0.47 per tick. 6.30-6.73 is narrower than that range, so a
  single start can miss it. 7.15 is about 0.75 over the capture's low end, inside one frame step of it. Not shown: whether
  a sweep at +-30 under per frame reaches 6.40-6.63. Fix: score +-30 over the sweep as +-60 is, re-pinning TRUNK_SWEEP
  under per frame.

**All four B reds, read.** None is shown to be the per-frame cast itself. Release: 'first-tick' meeting a two-command
frame. Ditch: a stale r0001 pin. Crossroads: the test's window (measured). weaponLine: a single-start phase draw (read,
not measured). The candidate rule (one command a frame + the capture's phase + the ditch re-pin) would cover the release
and the ditch only. Crossroads needs the window moved, and weaponLine needs +-30 swept. Even with those, the weaponLine
sweep has to be measured before anyone says it passes.

### 10.1 The walls trial's two code changes (D; seat-walls, 2026-11-21; reading, pending review)
- **The contact stored once a game frame** (`Walker.frameBetween_`, agent/walls f7a1735982). `FUN_005483d0` stores or drops
  the contact once a frame, over one pass of one hit table (D:L413618-413671 for the no-hit branch, D:L413823-413901 for
  the record branch; r0004 0x54df00-0x54e204 the same apart from relocations; a Fable second read, 2026-11-21). With the
  walls met once a frame (`GROUND_WALLS_PER_TICK_READING` 'per-frame'), `frameWalls` also resolved the tick between two
  frame ends on the frame's predicted move, and stored or dropped the contact there: a drop the original never evaluates.
  Now that resolve leaves the contact; the wall hits, the cuts, the depth push and the look-ahead run as before. Held by
  `traversal.test.ts` ("the stored contact changes only on a game frame's end"; red at 9 of 13 starts before). Not covered:
  `Traversal.keepContact`'s `holdContact` every tick (research 281 s4.1's named departure).
- **A stick held through a clip is read on its frames** (`Walker.clipRead`, 154a769586). The actor pass copies the
  controller's axes before its driver on every tick, with no test of the clip playing (`FUN_00551ec0` D:L418613-418615;
  r0004 0x5575e8 word-identical; behind three gates and followed by listed zeroings, D:L418510-418702), so a stick held
  through a clip is not a press from rest when the clip ends (LATER 1219's `idleRead`). Held by `pressFrame.test.ts`
  ("a stick held through a clip"; red at rest 32 before) and `match/test/roomDoorHold.test.ts`.
