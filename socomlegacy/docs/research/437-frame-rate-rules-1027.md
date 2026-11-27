# 437 -- Five per-frame rules held to the game frame at any page rate (LATER 1027)

- Date: 2026-11-15. Branch `agent/wm-move-1027` (worktree `wt-wm-move-1027`), base `agent/next` fe5e110f94; LATER
  1027 (MISSION R8.1's audit, seat 8a, 2026-11-14: "five per-frame rules still run at the page's rate or a fixed
  1/60"), the controller's brief of 2026-11-15 (research number 437).
- Track: simulation. Status: every value below **reading, pending review** -- transcribed from the decompilation
  (`socom2_game.elf`, re-read at the source by the author of this note on 2026-11-15) and held by a unit test; nothing
  was run on the original.
- Evidence kinds, kept apart: **(D)** source inspection -- the decompilation at the lines cited, and the port;
  **(U)** unit tests -- `viewer/test/frameRate1027.test.ts` (the RED, one `describe` per rule, each at 30 Hz, a page
  step of exactly `GAME_FRAME_DT`, 60 Hz and 144 Hz) and the re-pinned tests named under each rule. **Not run when
  written**: the capture rig's pause held every run on the host this was written on (no vitest, no tsc), so every
  expected number in the tests was worked by hand in the comment beside it, and the RED and GREEN runs are the seat's
  to make and record. **(O)** the original running: none.
- The specification: the original runs each rule once a game frame, `GAME_FRAME_DT` = 525/15734 s (G below;
  `scene/src/gameFrame.ts`, proven, research 180 s0). So each cured rule gives, at a 30 Hz page (dt = G), exactly the
  original's per-frame result, and at 60 and 144 Hz the same outcome. The rulings: **MISSION R8** (a rate runs
  continuously with its per-frame constant converted to its exact per-second equivalent) for rule 1; rule 3 steps once a game frame (s3: the original's own shape, not R8's per-second form; the controller's choice, logged for the owner); **R8.1**
  (a rule that judges against a threshold between two frames judges over one game frame, a browser adaptation of the
  rule's window) for rules 2 and 4; rule 5 is a count of the original's frames, counted in game frames of real time.
- New names: none. `THROW_REARM_UPDATES_READING` keeps its name and value (s5, s6).

## 1. The throw-power chase (`FUN_00594cf0`)

- **The original (D).** `FUN_00594cf0` D:L453509-453516: while the pressure is above `DAT_00650668` (0.15) of the
  power, `power = pressure x dt x rate + power x (1 - dt x rate)` (D:L453515), rate `DAT_006505e0` (3) up and
  `DAT_006505d8` (1.5) down, once a controller update -- one a game frame, dt = G. Held at pressure 1 from 0, after n
  frames the power is `1 - (1 - 3G)^n`. Beside it, at its own level: research 326 s7.2's capture GR-1 reads the power
  0.1001 on the first chase's row and a step ratio of 0.90 a row -- 3G = 0.1001 and 1 - 3G = 0.8999 (the original
  running, scored there, not here).
- **The drift (U, worked by hand).** The port took that Euler step at the page's dt (`scene/src/projectile.ts`
  `stepThrowPower`), so a 0.3 s hold gave 0.61257 at 30 Hz (its last, partial step Euler too), 1 - 0.95^18 = 0.6028
  at 60 Hz and 1 - (47/48)^43 x (1 - 3 x 0.2/144) = 0.5973 at 144 Hz, for the original's 1 - (1 - 3G)^(0.3/G) =
  1 - exp(-0.1054735 x 8.99086) = 0.6126. (The row has 0.599 at 144 Hz; the arithmetic above gives 0.5973.)
- **The cure (R8).** The share of the gap closed in dt is `1 - (1 - rate x G)^(dt / G)` (`chaseShare`); a dt of
  exactly G takes the original's own `rate x dt`, so a 30 Hz page is the original's step bit for bit (the test
  compares with `===`), and any split of the same time composes to the same power. The release test is unchanged.
  `heldPower` steps G by default (its result no longer depends on the step). Every caller -- the page's update's
  substeps, `mountUntake` at the command tick, the hook's `throwNow` -- follows through the function; the room holds
  no copy.
- **Re-pins (U)**, each naming LATER 1027: `scene/test/projectile.test.ts` (one frame 3G, was 0.05 at 1/60; the 0.1 s
  rise 0.6355, was 0.65; the fall 0.7572, was 0.755; `heldPower(1)` 0.9576, was 1 - 0.95^60 = 0.9539; 0.25 s 0.5463,
  was 0.5367); `scene/test/grenade.parity.test.ts` (the hold table [0.271, 0.546, 0.794, 0.958, 0.998], was [0.265,
  0.537, 0.785, 0.954, 0.998]; research 85 s4's landing table worked again by hand through `throwVelocity` -- 0.1 s:
  60.29 u/s, lands 44.51 (was 59.0, 43.4); 0.25 s: 130.44, 119.63 (127.6, 116.0); 0.5 s: 217.40, 258.96 (213.9,
  252.2); 1 s: 238.67, 305.36 (238.7, 305.3); 1 s at 30 degrees 598.69 (598.7); 2 s at 30 degrees 598.81 (598.8); the
  quarter second at 30 degrees lands 468.63, floor 468, was 443 -- the method checked by reproducing the old 0.25 s row,
  127.57 and 115.97); `viewer/test/grenade.test.ts` (the taps through `heldPower(ticks / 60)`, was 1 - 0.95^ticks;
  the second's hold 0.9576); `viewer/test/crouchRunThrow.test.ts` (comments: 0.146 and 0.190, was 0.143 and 0.185 --
  the same side of 0.15); `viewer/test/matchFirearm.test.ts` and `viewer/test/reticle.test.ts` (the meter's fill
  32 x (1 - (1 - 3G)^(n / 60G)), was 32 x (1 - 0.95^n)); `viewer/e2e/grenade.spec.ts` (a second's hold 0.9576, was
  1 - 0.95^60); `viewer/e2e/grenadeHold.ts` (doc only: its lower curve e^(-3s) still lies under the law, 3.161 > 3,
  and its stepped upper curve is now the law itself; `test/e2eGrenadeHold.test.ts`'s brackets re-worked by hand and
  unchanged). `grenadeHoldRange.test.ts` and `matchActions.test.ts` go through the function and keep their pins.

## 2. The scoped kick's rise (`FUN_005b9280`)

- **The original (D).** `FUN_005b9280` D:L472119-472131, state 1: `progress += rate x dt` (D:L472125); if the goal
  `+0x3c` is below the progress (D:L472127), state 2 with no pitch change, else `pitch += rate x dt` (D:L472131); dt
  the game frame. With s = rate x G the rise adds n = floor(goal / s) steps (a goal equal to n s adds its step: the
  test is strict), peaks at n s, holds one crossing frame, then falls (the return rate, D:L472097-472115: the pitch and progress less it, D:L472101-472102).
- **The drift (U).** At the page's step the peak was floor(goal / (rate dt)) x rate dt: at goal 0.0975 and 0.5 rad/s,
  0.0834 at 30 Hz (n 5), 0.0917 at 60 (11 steps of 1/120), 0.0972 at 144 (28 of 1/288) -- the row's figures. The fall
  started at 12/60 = 0.2000 s at 60 Hz for the original's 6G = 0.2002 s.
- **The cure (R8.1).** The pitch rises at the rate a second up to n s (n with a 1e-9 guard for the equality), and the
  kick leaves state 1 once the progress reaches (n + 1) s -- (n + 1) game frames of time: at 30 Hz the original's frames
  (s, 2s .. 5s, 5s on the crossing frame, then 5s - 0.18G), at 60 and 144 Hz the peak 5s = 0.0834 and the fall from
  within one page frame of 6G (frame 13, 0.2167 s, at 60 Hz; frame 29, 0.2014 s, at 144). The fall and the stick
  follow are unchanged. `viewer/test/weapon.test.ts` now pins the peak to floor(goal / s) x s (its `toBeCloseTo(goal,
  1)` could not tell); its other kick cases and `lookGate.test.ts`'s are unchanged by inspection (a held trigger at
  FireWait 0.12 rises 0.06 a round, under n s = 0.0834).

## 3. The blocked-muzzle pip's fade (`FUN_00215250`)

- **The original (D).** `BitmapReticule_UpdateAccuracy` `FUN_00215250` D:L69706-69770: each call the pip's alpha
  moves by `+0x20c`, set to -32.0 (0xc2000000, D:L69743-69744) to hide it and +32.0 (0x42000000, D:L69765) to show it
  while under 128 (D:L69767-69770); no dt in it -- 32 a frame, the HUD's frame one a game frame. A fade 128 -> 0 is 4
  game frames, 4G = 133 ms.
- **The drift (U).** `Reticle.setPip` stepped `stepPip` on a fixed 1/60 clock ("the game's 60 frames a second", the
  figure research 180 s0 retired): 4/60 = 67 ms at 60 Hz, two steps a frame at 30 Hz (67 ms), 10/144 = 69 ms at 144.
- **The cure (once a game frame; not R8's form).** The clock steps G, its default dt one game frame: 96, 64, 32, 0 at 30 Hz; 9 page frames (0.150 s;
  8/60 is 0.14 ms short of 4G) at 60 Hz; 20 (0.139 s) at 144 -- within one page frame. `stepPip` itself is unchanged.
  The watcher's fresh-subject fade (`matchFirearm.ts` `subjectReticle`) handed 4/60 s to clear the pip at once; it
  hands 4G now (with 4/60 it would have taken one step of the four). The reticle tests that step `setPip` without a
  dt step one game frame a call, as they stepped one 1/60 frame before.
- **The treatment (review F3).** MISSION R8 runs a rate continuously at its per-second equivalent and keeps the
  once-a-frame step for the trajectories only. This cure steps the fade once a game frame instead: the pip's alpha moves
  in whole steps of 32, and under set 3 the frame's second fade (D:L70433, D:L70435-70445) is a whole step too -- a
  continuous fade at 32/G a second would change what set 3 shows (a held 96, a drop of 64 a frame). The outcome over a
  second is R8's either way; the shape is the original's. Ruled by the main controller (c3772e03, 2026-11-15 about 16:23Z):
  the once-a-frame step stands -- R8's continuous form does not apply to a rule the original steps in whole frames --
  logged for the owner as a choice between forms.

## 4. The exertion's snap (`FUN_00550ef0`)

- **The original (D).** `FUN_00550ef0` D:L418378-418386, mode 0: step = -rate x dt (D:L418378), `cur += step x (0 -
  cur)` (D:L418379), then cur := 0 when `FUN_0052eb60` finds it within the window of 0 -- the step when `0.005 < step`
  (D:L418381-418382), else 0.005 (D:L418367) -- dt the game frame. HELD_RIFLE prone (`SniperDecayRate` -0.2): the
  window 0.2G = 0.0066735.
- **The drift (U).** The port judged the window at the page's step: max(0.2/60, 0.005) = 0.005 at 60 Hz, 0.005 at
  144, so an exertion between 0.005 and 0.0067 survived a pull there (it decays through that band over about 1.4 s).
- **The cure (R8.1).** Only the window: its step taken at TICK (= G), `window > 0.005 ? window : 0.005` as the code
  had it; the pull itself is out of the row and unchanged. Negligible in play (the sway gates at 0.2), as the row says.

## 5. The held trigger's re-arm (`THROW_REARM_UPDATES_READING`)

- **The original (D).** `FUN_00594cf0` D:L453484-453500: the pop's controller update clears bits 0x40 and 0x80, zeroes
  the power and remaps the edge; the next sets the wind-up bit on the held button's fresh press (D:L453633-453637); the
  one after chases from 0 (D:L453505-453517). Two controller updates, one a game frame: 2G = 67 ms.
- **The drift (U).** `GrenadeThrower.update` counted its own calls: 2 page frames, 33 ms at 60 Hz, 14 ms at 144 (review
  F2 of GRENADE-RETHROW named it).
- **The cure (game frames counted).** `finishThrow` arms a countdown of `THROW_REARM_UPDATES_READING x G` seconds and
  each update takes its real seconds off it; the wind-up re-arms on the first update at which 2G have passed since the
  pop's: the 2nd at 30 Hz (0.0667 s), the 5th at 60 Hz (0.0833 s: 4/60 is 0.07 ms short of 2G), the 10th at 144 Hz
  (0.0694 s) -- within one page frame. Re-pinned: `viewer/test/throwAgain.test.ts`'s three re-arm counts at 1/60 s
  updates, `toBe(5)`, were `<= 2`.

## 6. Readings

| Name | Where | Level | What |
|---|---|---|---|
| `THROW_REARM_UPDATES_READING` | viewer `src/grenade.ts` (`finishThrow` arms it, `update` -> `rearmWindUp`) | the count 2 at research 326's level (s7.2: proven by GR-1 for the class-0x79 path, an M67 pass open); its counting in game frames of real time **reading, pending review** (LATER 1027, s5) | `2` controller updates from a throw clip's pop to the next wind-up's first chase, the trigger held through the clip (research 326 s2.1, s7). Counted since LATER 1027 in game frames of the update's real seconds (2 x G), not in page updates (review F2's frame-rate dependence, cured). The constant's own doc in `grenade.ts` still says "reading ... settles: a PCSX2 capture", behind research 326 s7.2's GR-1 for the class-0x79 path; the M67's own pass is the open part. |

The four other rules add no name: their constants (`THROW_POWER_RISE`, `THROW_POWER_FALL`, `THROW_RELEASE_FRACTION`,
`PIP_FADE`, `PIP_FULL`, the kick's record, `SniperDecayRate`, 0.005) are the original's, cited where they stand.

## 7. Owed

- Run on Shadow PC 1, one file at a time, Node v24.13.1 (unit tests): RED at 5088e442a7, 15 failed | 5 passed (20);
  GREEN at c48e071b62, 20 passed (the RED's own 7-place pin of 0.2G corrected there). The re-pinned files at
  c48e071b62, green but `matchFirearm.test.ts` (1 failed: the grey case stepped 1/60; re-pinned to one game frame at
  d0c8873f15, 155 passed). Owed: the viewer suite whole and the typecheck on a box; the e2e specs re-pinned
  (`e2e/grenade.spec.ts`) in a browser run.
- A fresh review that re-reads each citation above at the decompilation (the level stays reading, pending review until
  it does).
- Not covered by the row and left: the module doc of `viewer/src/grenade.ts` (its lines 52 and 83 describe the chase as
  `power += (pressure - power) x rate x dt`, the original's per-frame form, still true of the original) -- the file is
  shared by part and only the re-arm's lines were claimed.
