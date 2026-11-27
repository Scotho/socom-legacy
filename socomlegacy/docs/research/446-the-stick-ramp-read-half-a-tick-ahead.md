# 446 -- The stick ramp read half a tick ahead (LATER 1164, strafe snappiness)

- Date: 2026-11-18. Branch `agent/later-1164` (worktree `wt-later-1164`), landing as a pair with LATER 1173 on
  `agent/later-1173`. The owner's priority (relayed by the main controller, 2026-11-18 about 02:35Z, verbatim): "so this
  manifests pretty clear issues with our games movement snappiness when strafing. This should be the new priority ... with
  equal settings the two clients should move the same when strafing as i do in this clip".
- Track: simulation. Status: the rule is **reading, pending review** of this note; the r0004 numbers it rests on are a
  **capture comparison, unscored** (no capture-scored spec holds them yet); `viewer/test/strafeRamp.test.ts` holds the
  port to them as a unit test.
- Evidence kinds, kept apart: **(C)** capture comparison -- the EPH run `eph-run-ac/runs/20261118T022816Z` (the owner's
  live session, r0004 M51 slot 5 against page b679913838, 103 strafe holds) and three Shadow PC 2 base replays
  (`agent-mail/evidence/weekend-mega-2026-11-14/later1164/BASE-SCORE.md`); **(D)** source inspection -- the decompilation
  (`FUN_00586c10`) and the port (`viewer/src/mover.ts`); **(U)** unit and dev-disc runs of the port.

## 1. What the original does (C, D)

- `FUN_00586c10` steps the stick throttle once a 30 Hz game frame by its rate (`lower/upper_x_accel`,
  `lower/upper_z_accel`, 2 and 5 a second, `dynamics.rdr`), called once a frame (D:L438964); the frame then moves WHOLE at
  the stepped value (D). At a full stick that is one 1/6 step a frame.
- The owner's run, each side on its own strafe axis: r0004 moves 0.363, 0.722, 1.084, 1.445, 1.807, then 2.166 a frame
  from rest (C; the median over 30 holds of 300 ms or more, from the first frame that reads the stick). The base
  replays' PCSX2 median: 0.362, 0.724, 1.081, 1.441, 1.802 (C). After k frames of the ramp the body has moved
  top x GAME_FRAME_DT x k(k + 1) / 12: 0.3615, 0.7230, 1.0844, 1.4459, 1.8074 a frame (the pair review's re-read, D).
- The other parts of a strafe matched already (C): the input path (the stick seen 25 / 26.8 ms after the press, PCSX2 /
  page), the steady speed (63.73 / 64.17 and 58.75 / 58.34 u/s over long holds), the release and reversal (the snap,
  `FUN_00586c10`, MISSION R8.1). The run's 21% shortfall was mostly the harness's (LATER 1165: the page seeded at yaw
  170.87 against 180; page.csv's feet interpolated by the render phase).

## 2. What the port did, and the change (D, U)

- MISSION R8 runs the ramp continuously at 60 Hz, the per-frame constant turned into its per-second rate. Tick n from
  rest moved at n/12 of the band: 0.271, 0.904, 1.898, 3.253, 4.970, 7.049 at the frame ends (U) -- half a step behind
  the original, 0.54 short at the top and about one tick later to 90 % (117 against 100 ms in the run's t90).
- `RAMP_LEAD = 0.5`: the stick a ground MOVE uses is the ramp read half a tick further along (`throttle()` returns it;
  `locomote` uses it for standing, the crouch run and the crouch walk). Tick n then moves at (n + 1/2)/12, and each pair
  of ticks lands on the original's frame end; the frame that reaches the top lands 0.05 short (the read is capped at the
  stick). The state's stick -- the snap's reference, the clips, the idle test -- is the ramp as before. Prone has no
  ramp; the jump's air control (an R8 trajectory) is untouched. The room's mover and the bots run the same Walker.
- The main controller's ruling (2026-11-18 about 02:55Z, for the owner): within R8 -- R8 keeps the 60 Hz continuous ramp
  and says its totals are the original's; the lead keeps both and lands on the original's frame ends (parity clause 6).
- Note on the feel table (research 88): the port's 60 Hz model with the lead gives 59.538 for 1 s of W from rest;
  the original's own 30 Hz frames give about 59.58 (the pair review, finding 4) -- the table's row is the port's model.

## 3. What it moved (U)

- Every path from rest is up to 0.54 longer over the first six frames; a body's first tick moves 1.5 ramp steps. The
  classing of every red this caused (`later1164/RED-CLASSING.md`): class A pins re-pinned with reasons; four bot
  manoeuvres tuned to the old half-tick-late body re-tuned under LATER 1173 (product track).
- The weaponLine r0004 capture spec (a capture of the original, so not re-pinned by design): its stand-off against a wall
  is a sawtooth over where the walk starts, one 60 Hz move wide (LATER 681 / 784), as wide as the capture's own range.
  The controller's ruling (a) and its refinement score it over a fixed sweep of 13 starts: the head's in-range count no
  more than one below the trunk's, and the swept range overlapping the capture's. At -60: trunk 7 of 13, head 6 of 13
  (on 61 starts the two land inside at the same rate, 51 %: the pair review).
- The census of walls walked into (LATER 1167, a test instrument) was corrected while this was traced: it counted a face's
  bounding line, not its polygon; it now counts a front entry reaching the walker's low line.

## 4. Not established

- The head has not been scored on the capture harness's bar yet: the Shadow PC 2 head replays x3 (the agreed bar: the
  page's ramp frames 1-5 within 0.05 of PCSX2's, median of 3, counted from the first tick that sees the stick) follow
  the pair's review.
- Whether the original's frame step and the port's half-tick read differ anywhere but at the cap (the sixth frame, 0.05)
  -- a partial stick, easing down, a reversal without a centre gap -- is not captured; the unit tests hold the port's
  reading of `FUN_00586c10` there.
