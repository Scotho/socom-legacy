# 208 -- The game frame: 30 Hz, 525/15734 s, one constant for page and room, pinned equal to the menu's (PF-01)

Written 2026-10-04 for web sprint 25's PF-01 (the plan `../plans/2026-10-04-three-maps-and-feel.md`, rulings PF.R3 and
PF.R8). The port took its walk, look, bloom and grenade flight at 60 Hz from research 71 §1.5's reading of `CGame::Tick`;
the 2026-10-04 research wave found the game's frame is 30 Hz with a measured dt. This note records the answer, cites
its evidence (it re-derives nothing), states the shape PF.R8 rules for the port, and lists the per-frame consumers the
next tasks convert. It stands on [180 §0 and §8.2](180-c2-movement-body-camera.md) (C2 and its V1 verification),
[179 §2 and §9.13](179-c1-match-server.md) (C1's `FLIGHT_TICK`), [184 §10.6](184-c5b-frontend-dialogs-input-boot.md)
(V4 #17), [206 §1 and §2](206-verification-overrides-and-the-waves-close.md) (the overrides; V6) and
[110](110-the-frame-clock.md) (the front end's clock, which reached the same frame first). **Confidence: proven for the
frame** (three independent lines, §1); the consumers' conversions are each their own task's.

## 0. Answers

- **The game frame is 30 Hz: dt = 525 / 15734 s = 0.03336723 s (29.9695 Hz; 29.97 nominal).** One core-state tick a
  frame with the measured dt, no fixed sub-step; the frame cap `DAT_003e1400` is 30 (§1).
- **One constant**: `GAME_FRAME_DT` in `packages/scene/src/gameFrame.ts`, exported by `@s2u/scene` -- the package the
  page and the room (`room.ts` already takes `stepGrenade` from it) import. `uiClock.ts` keeps its own
  `GAME_FRAME_DT_SECONDS` (`NTSC_FRAME_HBLANKS / NTSC_HBLANK_SCALE`, the same 525/15734 since research 110), because
  `@s2u/ui`'s index may load no `@s2u/scene` (§2); `packages/ui/test/clock.test.ts` pins the two equal.
- **The decision PF.R3 asked for** (PF.R8): the 60 Hz command and snapshot transport stays; per-frame constants run once
  per game frame through a fixed 30 Hz accumulator (`GameFrameAccumulator`, same file); discretised integrations step at
  `GAME_FRAME_DT` inside it; per-second laws do not move (§2).
- **No consumer is converted here.** The 60 Hz comments that called the port's tick the game's frame now say what it is
  (§3); PF-02, PF-03, PF-04 and PF-06 convert one constant each (§3's table).
- **Research 88's feel table** was scored at 60 Hz; the rows that move are named in §4 and are re-baselined after wave 2.
- **Amended by MISSION R8** (the owner, 2026-10-04, a known deviation; §9): only the trajectories -- the jump and every
  fall, a grenade's and a launched round's flight -- keep the exact 30 Hz steps, **drawn interpolated** between game
  frames; the bloom's dilate, the turn ramp, the camera ease, the shake and the recoil follow run **continuously** at
  their per-second equivalents, and the pad and keys are read every drawn frame.
- **Placeholders added**: none (§6).

## 1. The evidence

| line | what it shows | where |
|---|---|---|
| the code | `FUN_001e7040` (D:L47855-47878) ticks the core state once per swap with `DAT_004a449c`; the swap `FUN_003aff30` (D:L304731-304768) waits fields while `elapsed + 1/60 < 1/DAT_003e1400`; `.data` holds `DAT_003e1400` = `DAT_003e13f8` = 30; nothing sets 60 for a match | [180 §0](180-c2-movement-body-camera.md), U1; V1 [§8.2](180-c2-movement-body-camera.md) |
| the dumps | the cap is 30 in all 25 RDRAM dumps; every PCSX2 dump reads dt 0.03336723 = 525/15734 (two NTSC fields over the integer H-blank rate `DAT_0049e2d4` = 15734); the recomp's dumps read 524/15734 or slower (host artefacts) | V1 #1, [180 §8.2](180-c2-movement-body-camera.md) (correcting §0's table: `frostA/B_probe600` are recomp dumps) |
| the authors' own 1/30 | the pad reset `FUN_002dba60` primes the look ramp `FUN_002da930` with a literal 0x3d088889 = 1/30 s (0x2dbae8, 0x2dbb18); a movie path does the same (D:L208635) | V1 #1, [180 §8.2](180-c2-movement-body-camera.md) |
| the menu | the menu frame is two fields: 525 H-blanks, dt 0.033367 s, 29.97 Hz in all three PCSX2 dumps; "30 Hz" is nominal | V4 #17, [184 §10.6](184-c5b-frontend-dialogs-input-boot.md); [206 §1.2](206-verification-overrides-and-the-waves-close.md); research 110 §1 |
| the projectile | the grenade steps once per game frame at the frame's dt, not at 1/60; C1 suggested 1001/30000 -- the measured 525/15734 (16 ppm longer) supersedes it | [179 §2, §9.13](179-c1-match-server.md) (`FLIGHT_TICK`) |
| what does not move | the looped clips' rate rescale `FUN_0028aa20` is per second (K = T x 100 / D) and the port already applies it for 122 of 124 clips: clip rates are dt-scaled and unaffected by the frame | V6, [206 §2](206-verification-overrides-and-the-waves-close.md) |

The network was never frame-locked: the receive pump `FUN_002ce930` (D:L171840) runs on its own thread every 50 ms
of the H-blank clock ([180 §8.2](180-c2-movement-body-camera.md)). That is why PF.R8 can keep the port's 60 Hz
transport.

## 2. PF.R8's shape, and the port

- **One constant**: `GAME_FRAME_DT = 525 / 15734` (`packages/scene/src/gameFrame.ts`). The page imports it from
  `@s2u/scene`; the room from `@s2u/scene` as it takes `stepGrenade`, `launchGrenade` and the arsenal. `@s2u/scene`
  is the lowest package both already depend on, so the package boundaries (`tools/test/packageBoundaries.test.ts`)
  hold: nothing below the viewer reaches into it.
- **The front end's copy**: `uiClock.ts`'s `GAME_FRAME_DT_SECONDS` stays its own `NTSC_FRAME_HBLANKS /
  NTSC_HBLANK_SCALE` (525 / 15734, bit-identical). It cannot import the scene's: `uiClock.ts` is re-exported by
  `@s2u/ui`'s index, which must load no `@s2u/scene` (INT-LOADING review F3; `packages/ui/test/headless.test.ts`). A
  test may import both, so `packages/ui/test/clock.test.ts` pins `GAME_FRAME_DT_SECONDS === GAME_FRAME_DT`.
- **The transport stays at 60 Hz**: `TICK_HZ` (`net/protocol.ts:78`), the mover's `TICK` (`mover.ts:137`), the
  snapshots at 30. A browser adaptation, now said in each constant's comment.
- **The helper**: `GameFrameAccumulator.advance(dt)` adds real seconds, returns the whole game frames elapsed and keeps
  the remainder; `alpha()` is the part-frame for drawing; a backlog past `GAME_FRAME_MAX_STEPS` (30, the existing
  loops' cap: `mover.ts:350` `MAX_TICKS`, `accuracy.ts:348`) is dropped, not run later. Fed the 60 Hz tick it yields
  29.97 frames a second with no drift (§5). A consumer applies its per-frame constant once per frame it returns.
- **Integrations whose discretisation shows** (the jump, the grenade's flight) step at `GAME_FRAME_DT` inside the
  accumulator; **per-second laws** (the run speeds, t90's rate limit, the throttle) stay as they are.
- **MISSION R8 amends this shape** (§9): the accumulator is kept only for those two trajectories; the per-frame
  constants of §3 other than theirs run continuously at their per-second equivalents.

## 3. The per-frame consumers, and who converts them

The comments changed here (behaviour unchanged): `mover.ts:16-19` (the header's "The tick") and `mover.ts:131-137`
(`TICK`), `accuracy.ts:10-11` and `accuracy.ts:32-38` (`TICK`), `camera.ts:74-78` (`LOOK_TICK`) and its loop's comment
(`camera.ts:567-569`), `grenade.ts:42` and `grenade.ts:52-57` (`FLIGHT_TICK_READING`). Each now says it is the port's
60 Hz tick and points at PF.R8 and `GAME_FRAME_DT`.

| task | consumer (file:line, at this note's commit) | today | at the game frame | source |
|---|---|---|---|---|
| PF-02 | `accuracy.ts:38` `TICK`, the bloom's `dilateMove` step (`accuracy.ts:363`) and its loop (`accuracy.ts:348`) | per 1/60 s | once per `GAME_FRAME_DT` | [181](181-c3-combat-hud-effects.md) X1; [180 §0](180-c2-movement-body-camera.md) item 4 |
| PF-02 | `look.ts:115` `RAMP_PER_SECOND_READING` = `60 x rampStep(1/60)` (2.334/s) | 60 Hz frame | `rampStep(GAME_FRAME_DT) / GAME_FRAME_DT` (1.553/s; full push in 0.42 s) | [180 §1.1](180-c2-movement-body-camera.md), U2 |
| PF-02 | `camera.ts:78` `LOOK_TICK` = 1/60 (the look law's step) | 60 Hz | `GAME_FRAME_DT` | [180 §0](180-c2-movement-body-camera.md) item 1 |
| PF-02 | `playerCamera.ts:116` `CAM_REGROW` = 0.03 a frame (applied `playerCamera.ts:164`) | per page frame | per game frame (time constant 1.09 s, not 0.55) | [180 §0](180-c2-movement-body-camera.md) item 2, U4 |
| PF-02 | `look.ts:385` the shake's fall, `frames = dt x 60` | 60 | `dt / GAME_FRAME_DT` | [180 §0](180-c2-movement-body-camera.md) item 3 |
| PF-03 | `mover.ts:1613-1621`, the airborne integration (`vy -= g dt`, `y += vy dt`) and the wind-up's five ticks | at `TICK` | at `GAME_FRAME_DT` with research 90 §8's order -- settled by PF-03: v then y (`FUN_0059b440` D:L456496-456498), the delay counted first (`FUN_005af930` D:L466797-466803); the rise 12.27 over feet sunk 0.785 by the two-frame wind-up: the top 11.485 over the floor, 22 frames in the air | [180 §0](180-c2-movement-body-camera.md) item 5; [90](90-playtest-2026-09-28.md) §8 |
| PF-04 | `grenade.ts:57` `FLIGHT_TICK_READING` = 1/60 (loop `grenade.ts:1135-1144`) and the room's `stepGrenade(f.g, 1 / TICK_HZ, ...)` (`room.ts:2135`, whose comment at `room.ts:2122` still calls 60 Hz the game's) | 60 Hz, page and room | `GAME_FRAME_DT`, page and room together; fixtures re-baselined | [179 §9.13](179-c1-match-server.md); [181 §6.4](181-c3-combat-hud-effects.md) X4 |
| PF-06 | `rifleKick.ts:38` `STICK_FOLLOW_PLACEHOLDER` = 0 (the game's `DAT_00650980` = 0.04 x push) | absent | 0.04 x push per game frame | [181](181-c3-combat-hud-effects.md) STICK_FOLLOW |

Since MISSION R8 (§9) the PF-02 rows of this table (the bloom's dilate and the exertion's raise, the look ramp and its
step, the camera's let-out, the shake's fall) and PF-06's stick follow run continuously at their per-second equivalents;
PF-03's and PF-04's (the air, the flight) keep the game frame and are drawn interpolated.

## 4. Research 88's feel table, at 60 Hz

[Research 88 §2](88-feel-parity.md)'s table was scored with the mover, the look and the jump at 60 Hz ("60 Hz",
"60 frames", "tick 11", "5 ticks of the wait + 40 of flight" in its source column). After wave 2 (PF-02, PF-03,
PF-04, PF-06) it is re-scored at the game frame. The rows that move:

| row (research 88 §2) | 60 Hz value | moves with | expected |
|---|---|---|---|
| arrow held: time to the full turn, s | 0.283 | PF-02 (the ramp per game frame) | about 0.42 (full push in 13 frames) |
| 1 s of an arrow from rest, deg | 111.329 | PF-02 | lower (a slower ramp); re-scored |
| running jump: the feet's top, u | 12.925 | PF-03 | 11.485 over the floor (v then y, settled by PF-03; 12.27 over the sunk feet) |
| running jump: time in the air on flat ground, s | 0.75 | PF-03 | re-derived (the wind-up and the flight in game frames) |
| walk off a 42 drop / off the 142 deck: time in the air, s | 0.600 | PF-03 | within a frame of 0.598; re-scored |

The rows that do not move (PF.R8's per-second laws): the run speeds, the strafes, the prone and crouched speeds, the
pad push rows, the camera's distances and angles, the field of view, the clips' keys a second. The two rows counted in
ticks -- t90 (`FUN_00586c10`: tick 11) and "1 s of W from rest" (the ramp over 60 ticks) -- are the throttle's
per-second rate limit; they stay, and the re-score reports any shift under one frame.

## 5. Tests

| test | holds | data |
|---|---|---|
| `packages/scene/test/gameFrame.test.ts` | `GAME_FRAME_DT` = 525/15734 (0.03336723, 29.9695 Hz) and its export; the accumulator: exact counts over an uneven sequence, no drift over 10,000 uneven steps of whole H-blank counts (checked against integer arithmetic), 29,969 frames in 1000 s of 1/60 s steps, 10,000 frames from 10,000 `GAME_FRAME_DT` steps, the cap at 30 dropping the backlog, the remainder kept at an exact cap, negative and non-finite dt ignored, `reset` | none |
| `packages/ui/test/clock.test.ts` (existing, one line added) | `GAME_FRAME_DT_SECONDS` = 525/15734, and equal to the scene's `GAME_FRAME_DT` | none |
| `packages/ui/test/headless.test.ts` (existing) | `@s2u/ui`'s index loads no `@s2u/scene`: why the UI keeps its own copy | none |

## 6. Placeholders and readings

None added by this task. `GAME_FRAME_DT` is a proven value (§1); `GAME_FRAME_MAX_STEPS` is the port's guard against a
stalled tab, not a game value (the console stretches one frame's dt instead of catching up). The per-frame stand-ins
the next tasks resolve are listed in their own notes (180, 181, 179) and in §3.

## 7. Not done, and owed

- **No consumer converted** (by the brief: PF-02, PF-03, PF-04 and PF-06 each take one, test first).
- **`room.ts:2122`'s comment** still calls the page's 60 Hz flight the game's; left to PF-04, which changes that
  function, so this task touches no server file.
- **`look.ts:110` and `look.ts:341`** read "a 60 Hz game frame [reading]" and "dt x 60 [reading]"; left to PF-02, which
  replaces both constants.
- **The feel table's re-score** (§4) waits on wave 2.
- **Proof of a per-frame consumer on the original** (a capture of the look ramp or a grenade's positions per frame)
  is owed by the consumers' notes ([206 §4](206-verification-overrides-and-the-waves-close.md)); the frame itself needs
  none.

## 8. Settled, not settled

- Settled: the game frame (30 Hz, 525/15734 s), its one constant, where it lives and the menu's pinned copy, PF.R8's shape, the helper; the jump's integration order (PF-03: the delay, then the fall speed, then the height -- research 90 §8, D:L456496-456498).
- Not settled: whether t90's rows shift under one frame at the game frame (§4).

## 9. MISSION R8: the hybrid, a known deviation (2026-10-04)

**The ruling.** The owner, playing sprint 25's build: "the speed is good, but the feeling was wrong"; "yes to the interp
fix"; then "agreed on hybrid. make this a known deviation" ([MISSION R8](../MISSION.md), amending PF.R8). The original
runs its game logic once a 30 Hz frame on a 30 fps screen: it draws every frame it steps, so nothing on the console is
interpolated, and nothing here has an original. These are browser adaptations, labelled in the code where each lives.

**1. The trajectories keep the game frame and are drawn interpolated.** The step-by-step arithmetic is itself the result
there (the jump's top 11.485 and frame 22, the landing speed fall damage reads; the grenade's sag and bounces), so the
simulation is untouched and only the drawing changes:

| what | simulated (unchanged) | drawn | where |
|---|---|---|---|
| the airborne height (the jump, every fall, a knock) | once a game frame in `Walker.fall` (`airClock`) | between the last two game frames' heights by `airClock.alpha()`, sampled at each 60 Hz tick's end and spread over the tick like x and z (`Walker.drawnFeet`); the body, the walk sounds, the effects and the camera read it | `mover.ts` (`airFrom`'s comment) |
| the camera on it | `PlayerCamera` ticks on the simulated feet | the third-person view lifted by the drawn height's offset; the head's eye from the drawn feet; the reticle's aim point with it | `walk.ts` `follow`, `aim` |
| the shot's eye (`fireAim`), the hook's camera | -- | stays on the simulated height (`Walker.tickFeet`), so the claim the room's `ShotCone` checks is the one it always was | `walk.ts` `follow` |
| every start point: a throw's hand, a muzzle, a placed charge, the C4's reach, the PMN's actor | -- | the snapshot's `feet` is `Walker.tickFeet` (the simulated height between ticks, as before R8); only the page's body is placed at `PlaySnapshot.drawnFeet` | `mover.ts` `moverSnapshot`, `walk.ts` `snapshot`, `play.ts` `bodyFrame` |
| a net correction in the air (`applyCorrection` nudges `state.y` after the tick) | -- | carried into the next tick's starting sample (`drawPrevY` = the last sample + the move since its tick's end), so the drawn height never steps back | `mover.ts` `drawTick` |
| a grenade's or a launched round's flight | once a game frame in `GrenadeThrower.fly` (`flight`) and the room's `flyGrenades` | between the last two frames' positions by `flight.alpha()`, the tumble quaternion slerped | `grenade.ts` `drawLive` |

**How far the drawing trails.** The drawn trajectory runs a game frame behind the simulation (the interpolation is
between the last two frames), and the drawn height a further 60 Hz tick (the tick's own interpolation). That is an
offset for the whole airtime, growing with the fall speed, not a one-frame blip: measured against the simulated height
between ticks (`tickFeet`) at 60, 144 and 240 Hz, at most about **1.2 units** through a running jump (mean 0.29), about
**2.0 at 115 u/s** (mean 1.0; the hard-landing speed) and about **3.6 at 200 u/s** (mean 1.9). The landing tick
catches up. Only what is drawn trails (the body, the camera, the reticle's aim point); the start points, the shot's eye,
the room, the network, the snapshots and every trajectory test are unchanged.

**2. Everything else runs continuously at its per-second equivalent**, the per-frame constant x dt / `GAME_FRAME_DT`,
so a second's total is the original's:

| law | the original, once a game frame | the port since R8 | where |
|---|---|---|---|
| the bloom's dilate, `TargetDilateUponMovement` | 1 a frame (29.97 a second; 29 frames in the first second) | `dilateMove x dt / GAME_FRAME_DT` each page frame or room command: 29.97 a second | `accuracy.ts` `TICK`'s comment, `tick` |
| the exertion's raise `FUN_00578150` | a frame's sticks | x dt / `GAME_FRAME_DT` | `accuracy.ts` `exert` |
| the turn ramp `FUN_002da930`, and its pad read | grown and read once a frame: full on the 13th (0.43 s) | read every drawn frame, grown at `RAMP_PER_SECOND` (1.553 a second): full in 0.4185 s | `camera.ts` `LOOK_MAX_DT`'s comment, `look.ts` `RAMP_PER_SECOND` |
| the camera's let-out `DAT_003de270` | 3 % a frame | `1 - 0.97^(dt / GAME_FRAME_DT)` a tick (already so since PF-02) | `playerCamera.ts` |
| the shake's fall `decr` | a frame's | x dt / `GAME_FRAME_DT` (already so since PF-02) | `look.ts` `ScreenShake` |
| the scoped kick's stick follow `DAT_00650980` | 0.04 x push a frame | x dt / `GAME_FRAME_DT` (already so since PF-06) | `rifleKick.ts` |

**What deviates from the original:** the once-a-frame pad read (the original's turn answers up to 33 ms after the port's)
and the sub-frame stair-steps of the bloom and the turn ramp. **Page and room still agree**: the room's `ShotCone` feeds
the same continuous `Accuracy` one 1/60 s command at a time, and the cone slack PF.R9 (2 px plus one game frame of the
knock's return, `coneSlackPx`) is kept. The honest-rounds test (`shotCone.test.ts`, "the page's own frames at 144 and 30 Hz, the round after gunFrame on the last command: every honest first-person round is accepted")
models what the page does: page frames at 144 and 30 Hz from 40 phases of the tick, `walk.frame` sending the commands
before `gunFrame` runs the page's kit, the round tagged with the last command. At a round the page stands at most its
part-tick (under 1/60 s) past the room's command, so the per-second laws put at most a tick between them (1.17 px of
the M4A1's knock return); measured, at most 0.39 px at 144 Hz (the round leaves within a page frame of its command)
and 0 at 30 Hz (the lead is the same at every round, so page and room are the same law shifted in time). No honest
round is refused; PF.R9's 4.34 px (M4A1 standing) bounds it with room to spare. (The old version of the test put the
page's clock out of phase on a kit at rest, which on continuous kits proved nothing.)

**Tests** (`packages/viewer/test/gameFrameHybrid.test.ts`): the drawn jump height moves on every drawn frame and lies
strictly between the previous and the current game-frame heights at mid-frame, while the simulated heights are
`FUN_0059b440`'s frame by frame; the drawn grenade is the lerp and slerp of its last two frames by alpha while its
simulated position steps only on game frames; the third-person camera never holds a step in the air while the shot's eye
keeps the simulation's steps; a net correction after each tick never steps the drawn height back; the snapshot's feet (every start point) are `tickFeet`, the page's body alone at `drawnFeet`; the bloom opens `1 / GAME_FRAME_DT` a second at 144 Hz page frames and at 60 Hz commands;
the turn is the frames' right sum of the continuous ramp, full at 0.4185 s; a pad push turns the view on the next drawn
frame. Retitled with the ruling: `accuracy.test.ts` (the 29.97 a second, the constrict, each frame's own look rate),
`look.test.ts` (the look law every drawn frame), `shotCone.test.ts` (the cone continuous on commands);
`weapons.parity.test.ts` and `grenade.test.ts`'s tumble test follow.

## 10. MISSION R8.1: a per-frame threshold rule judged over one game frame; the stick's read measured (Q12, 2026-11-14)

R8 runs every per-frame law continuously at its per-second rate (§9). R8.1 (MISSION, R8.1; the owner's merge word
recorded there) adds one kind R8 does not cover: a rule that judges **the change between two of the original's frames
against a threshold**. Its case is the stick throttle's snap, `FUN_00586c10`: an axis past 0.78 lateral or 0.9 forward
on the last frame, changing faster than 7.8 or 9 a second, takes the pad's value whole; otherwise it ramps at 5 a
second. Run on every 60 Hz tick, that test splits a fast flick across two checks, so part of it ramps (finding 17, the
slow strafe reversal). The port (option B, `agent/throttle-frame`) keeps the continuous ramp and judges the snap against
the value at the last game frame's end (`Walker`'s `snapRef_`, the frames numbered by `throttleFrameEnds` from the
command's `commandSeq`): a **browser adaptation** of the rule's window to one `GAME_FRAME_DT`, labelled so in
`mover.ts`, with no input delay added. A press from rest has no tail snap: from a frame-end value of 0 the axis is never
past the threshold, so it ramps to 1 at 5 a second, as the original's stair-steps do.

**The capture (rig Q12, 2026-11-14; scored by seat 8a, 2026-11-14T01:20Z).** The original in PCSX2 (r0004,
`seal_A_scuba` at c1), the keyboard mapped to the left stick (digital, full deflection), key reversals with a host-clocked
centre gap of g ms, the throttle's words read at about 1.36 kHz. Evidence: the rig's files under the private bucket's
`gate-runner/shadow/out/2026-11-14/q10-hitreg/q12-strafe/`, copied with the score to
`agent-mail/evidence/deadzone-shark/q12/` (`rows.csv`, `commands.csv`, `q12-score-8a-2026-11-14.md`).

| g (ms) | runs | the centre seen | min(1, g / 33.37) |
|---|---|---|---|
| 0 | 6 | 0 (one whole snap each) | 0 % |
| 10 | 20 | 3 (15 %) | 30 % |
| 20 | 20 | 12 (60 %) | 60 % |
| 27 | 20 | 16 (80 %) | 81 % |
| 33 | 10 | 9 (90 %) | 99 % |
| 50, 80, 150, 500 | 10, 6, 6, 6 | all | 100 % |

**Proven** (measured on the original running, within the tolerance below):
- **The read interval is one game frame.** A centre gap is seen only when a frame's read falls inside it, about g / 33
  ms of the runs; a 60 Hz read would have seen all 20 runs at 20 ms (12 were seen), so 60 Hz is refused.
- **The ramp is one 1/6 step a frame.** Every seen reversal steps 0, ±0.167, 0.334, 0.5, 0.667, 0.834, 1: 408 steps,
  median spacing 34 ms (mode 33-34), about 4.9-5.0 a second, the port's 5 a second run continuously (R8).
- **A gap no read catches is one whole jump** from +1 to -1 (the snap's branch).

**Tolerance.** The rows' binomial spread, about ±0.2 at 20 runs. The 10 and 33 ms rows both run low (about a 1 % chance
together under the plain g / 33.37 law), which fits a small fixed read latency: **open**, and it does not move the window.

**Reading, not proven:** the snap's thresholds and rates (0.78 / 0.9 past, 7.8 / 9 a second), transcribed from
`FUN_00586c10` (D:L445017-445031) and not separated by this run (a digital pad only steps -1, 0, +1). Also open: which of
the throttle's two words (`+0x244`, `+0x248`) the throttle writes and which is a copy -- both take the ramp's values on
the same reads (472 of 525 changes together, the rest within ±1 ms) -- and about 9 % of the ramp's samples on 1/12 marks
(the step may be the rate times the measured frame time; unread).

**What holds it.** `packages/viewer/test/throttleFrame.test.ts`, the describe "THROTTLE-FRAME (R8.1) against the
capture rig's Q12, 2026-11-14, proven" (:336 on): per gap, the port's chance of seeing the centre over 240 frame phases
within 0.06 of min(1, g / 33.37), a snap within a frame, and a seen ramp at 5 a second. It compares the port against the
capture's rows as transcribed above. **Owed** (not built): the capture scored by the repository's own harness. The
score above was made by a scratchpad script (`q12score.py`, run with `python -I`), so no test re-reads `rows.csv`;
owed is a scorer in `tools/` with a golden of Q12's rows, or the rig's files as a fixture, so the proven rows are held by
the capture itself, not by their transcription.

**IDLE-FRAME: R8.1 reaches the idle test (2026-11-14; the main controller's order, on seat 8a's reading of the
reporting player's v0.4.22 feedback).** The idle test: a stick within 0.03 (`DAT_003f3428`) stops the body and keeps
the raw stick. STANDING it is `FUN_00586570`'s own (D:L444861-444867: both raw axes within 0.03 skip the slope
`FUN_005b56c0` and the ramp `FUN_00586c10`; the raw stick stored, D:L444868-444869), dispatched by `FUN_005870e0`
(D:L445165); crouched and prone it is `FUN_00586f00` (D:L445046-445086), called by the stance handlers (D:L443566,
443663, 443900, 444142), not by `FUN_005870e0`. Q12 and Q17 measured the standing case. The original runs both, like
the snap, once a game frame on the frame's read (the fresh review's F1 corrected the earlier citation of
`FUN_00586f00` alone). The port ran it every 60 Hz tick, so a centre crossed between two frames' ends stopped the
body for one tick, with the ground state idle and the move class reset. The original's read never sees that centre.

**Proven** (the same capture, its velocity column; scored by seat 8a, `agent-mail/evidence/deadzone-shark/reversal-8a/
q12_velocity.py`):
- On an uncaught gap the original's velocity jumps whole from +65 to -65, with no zero read at about 1.36 kHz.
- On a caught gap it reads 0 once, then 10.8, 21.7, 32.5, 43.4, 54.2, 65: zero to full in 199-204 ms (medians at
  g 10-33).
- The share of runs with a zero read: 0/6, 3/20, 12/20, 16/20 and 9/10 at g 0, 10, 20, 27 and 33 ms.
- The port before IDLE-FRAME (the real `Walker`, 240 phases): 0, 60, 100, 100 and 100 %.
- With IDLE-FRAME the port stops only where the frame's end sees the centre (the phases whose ramp starts there): about
  g / 33, within the tolerance at every row.

**The rule:** a tick whose stick is at rest and which does not end a game frame (`throttleFrameEnds` of the number
`throttleFrames` will give it) takes the last tick's read past the test again. A read at rest, a read a tick or more
old (a clip, an elapsed backlog, a placing), and a frame's end leave the stick as it is (`Walker.idleRead`). It is the
same browser adaptation of the window as R8.1's snap, with no input delay added.

**Reading, not proven:** that the idle test sits on the frame's read and not between reads (D:L444861-444867 and
D:L445046-445086 read the frame's saved stick; the capture agrees and does not separate the two).

**What holds it:** `packages/viewer/test/throttleFrame.test.ts`, the describe "IDLE-FRAME (R8.1) against the capture
rig's Q12": a still tick only where the ramp starts from the centre, and the share of still runs within 0.2 of Q12's.
Its (b) and (d) are re-pinned: a mid-frame centre tick runs on.

**The browser's dead-zone guard after it.** Since PZG the guard is radial: zero inside it, the raw push passed
outside. A guard wider than the game's own zone widens the centre the frame's end can see. Seat 8a's model
(`reversal-8a/settings-model-idleframe.txt`; a transcription, not a capture) runs full-left to full-right thumb flicks
at in-game DEAD ZONE 0 (a per-axis zone of 0.01). The share of 33 / 50 / 80 / 120 ms flicks with a still tick:

| guard | port | original (no guard) |
|---|---|---|
| 0.10 | 10 / 15 / 24 / 36 % (60-tick stops: 20 / 30 / 48 / 72 % before IDLE-FRAME) | 3 / 5 / 8 / 11 % |
| 0.03 | 3 / 5 / 7 / 11 % | 3 / 5 / 8 / 11 % |

At the default guard (0.15 behind RECRUIT's 0.3) the port's shares are the original's (31 / 47 / 75 / 100 % against
31 / 48 / 75 / 100 %). A guard wider than the game's own zone is the adaptation's cost: a product-track question,
not this rule's.

**Q17 leg D (the capture rig, 2026-11-14 evening; scored by the rig, relayed by the main controller).** Files:
`gate-runner/shadow/out/2026-11-14/q10-hitreg/q17-reversals/` (`D-gaps-rows.csv`, `D-gaps-commands.csv`, `D-score.txt`,
`setup.log`); the upload is owed, so these numbers are the rig's own score, not yet re-scored here.
- **Setup:** r0004 on MP2 at the open spot (900,600). `seal_A_scuba` was CROUCHED (posture 1; the order named no stance)
  and lowered. Digital reversals with gaps of exactly 5, 10 and 15 ms, 20 runs each, read at 1,061 Hz.
- **No zero-velocity read on an uncaught gap, 0 of 60.** Every uncaught run flips from +65 to -65 within one frame
  (press to full, median 16-23 ms). This is the original's behaviour that IDLE-FRAME gives the port.
- **Caught in 0, 25 and 45 % of the runs** (about g / 33).
- **A caught frame** has a throttle of 0, and the ramp after it starts at 0 (0.1668, 0.3337, ...): the idle test fired.
  Its velocity reads 4.381, not 0, with the same sign whichever way the reversal goes. A flip carried over would change
  sign, so this is no carry-over of the strafe. It fits the crouched idle's `Stand -> Crouch` (0x11), which the
  original pushes over the crouch idle when a crouch run is let go (D:L444316-444317; `CROUCH_RUN_RETURN_READING`,
  LATER 678). The clip's root moves the body along its own axis on that frame, and the next frame's stick cuts it.
- **The standing repeat, D-standing** (10 and 15 ms gaps), and the rig's own checks D-aligned-standing and
  D-aligned-crouched. Files: `D-standing-*`, `D-frames-merged.txt`, `D-caught-components.txt`, `D-aligned-*.csv`;
  upload owed.
  - Standing, every caught frame reads exactly 0.000 on both velocity components, Q12's result.
  - Crouched, every caught frame reads the actor-local vector (lateral -4.381, forward +5.192), |v| 6.79, in both
    reversal directions. The velocity words +0x2c..+0x34 are the actor's: +0x2c lateral (+ right), +0x34 along the
    facing (- forward). One run read (-3.245, +2.109). The next frame is pure lateral, and the 1/6 ramp starts.
  - That fixed vector is `Stand -> Crouch`'s root, left and forward. The port's own table of the clip's travel
    (`ACTION_CLIPS.standToCrouch.travel`, -1.2 x and +1.27 z over the clip) points the same way. **Reading:** the
    first frame's root key against -4.381/5.192 is not compared.
- **One frame per caught gap.** A game frame's words are written over about 1-2 ms, so a 1 kHz read can land
  mid-write: pad244 is written first, then thr248 and the velocity. The rig merges change points under 8 ms apart into
  one frame and takes that frame's last read.
  - By frame, every caught run (15 standing, 25 crouched) has exactly one frame with pad244 at 0. Standing, its speed
    is 0 on that same frame.
  - The one standing run whose caught read showed -65 was such a mid-write read; its frame reads 0.
  - So the idle test's timing is as built: one frame per frame read at the centre. **Score these captures by frame,
    not by read.**
- The port in COMBINED takes the crouch idle at once (OT.R93; H405); in SEPARATE it plays `standToCrouch`.

**Q17 legs B and B': the snap's two thresholds bracketed by capture (2026-11-14 evening).** The setup is the same rig
and spot as leg D, STANDING, lowered and RECRUIT, scored by game frame. Each level is given by its settled `thr248`.
Files are under `gate-runner/shadow/out/2026-11-14/q10-hitreg/q17-reversals/`: `B1p-*`, `B2p-*`, `B-prime-score.txt`,
`calib-3-standing.txt`, `B2p-0671-snap-dt.txt`; leg B's rows go up at the rig's stop.

**B1'** holds LEFT at a level, then goes full RIGHT in one step.
- Held at 0.4952, 0.7329 and 0.7645, it RAMPS (10/10 each), 1/6 a frame through zero.
- Held at 0.7962 and 0.8279, it SNAPS (10/10).

**B2' and B** go one step down from full RIGHT.
- To 0.923 and 0.844 it lands in one frame by the ramp (drops of 0.077 and 0.156, under one 1/6 step).
- To 0.7645 and 0.7487 it ramps 1 -> 0.833 -> target (drops of 0.236 and 0.251).
- To 0.717 and 0.701 it snaps (drops of 0.283 and 0.299).
- The "band" of two-frame ramps between snaps is the two tests together, not a third rule. A drop of one ramp step or
  less finishes by the ramp; a drop past 7.8 x 0.03337 = 0.2603 snaps; between the two, the ramp takes two frames.

**Proven, within these brackets:** the lateral `at` lies between 0.7645 and 0.7962, and the lateral `rate` between
7.52 and 8.48 a second. The constants 0.78 and 7.8 are the code's reading inside them.
- The forward axis's 0.9 / 9 are not bracketed: those rows were not run.
- The shipped `Walker` gives every row's frames within 0.003 (`packages/viewer/test/throttleCapture.test.ts`).

**A known divergence (LATER 1052).** The original divides the ramp and the rate test by the frame's MEASURED time
(`+0x2e0`; D:L444997-445028). Across Q17's B' files, about 1.7 % of frames are short (+0x2e0 = 0.01672, always that
value, one vsync early); whether a console runs them as PCSX2 does is unread. On such a frame:
- the ramp steps half (B1p-hold0676 run 2: 0.236 -> 0.32);
- a jump over 0.130 snaps: B2' run 8, a 0.251 drop, snapped on a 0.01672 s edge frame.
The port divides by the constant `GAME_FRAME_DT` and never sees either; MISSION R8 and R8.1 do not name this. The
player's mid-flick ramps are gated by `at` alone (prev under 0.78 after the caught frame), so a short frame changes
them only by a half step, which leaves the original the slower.

**Q17 leg C (digital keys, standing, RECRUIT): forward to strafe, and R8's shape deviation.** The rig drove keys, not
rim sweeps: W, W+D, D at full deflection; files `C1-*`, `C2-*` and `C-score.txt` in the same folder.
- **On the original:** forward to forward-right holds 65 on every frame while the lateral ramps 1/6 a frame. Forward to
  right drops the forward throttle to 0 in one frame and ramps the lateral (10.8, 21.7, ... 65 u/s): 193 ms median from
  the last edge to full, 168 ms under 95 %. With W+D held 17 or 33 ms first, 158 and 142 ms to full.
- **The port's rule gives the same frame-end values.**
- **The comparison that holds:** from the INPUT EDGE, over 240 phases of the edge against the frame and tick grids,
  counting the lateral distance lost against an instant full strafe from the edge (seat 8a's model with NO rig latency,
  `agent-mail/evidence/deadzone-shark/reversal-8a/legC_fromedge.py` and `legC-fromedge.txt`; not a Walker run):
  - both lose **6.50 u**, in every C row;
  - the port's first half step (1/12) comes a mean 8 ms after the edge, the original's first whole step (1/6) a mean
    17 ms after;
  - each 1/6 level is reached about 8 ms later in the port (25/58/92/125/158/192 ms against 17/50/83/117/150/184);
    full speed at 192 against 184 ms.
  - In expectation over the phase both curves are the same 5 a second ramp from the edge.
- **So it is R8's named deviation in SHAPE, not in distance:** finer, earlier half steps, and each whole level about
  8 ms later.
- **WITHDRAWN:** a first scoring gave the port "+0.5 u and +16 ms under 95 %" a change. It measured from each mover's
  own first reaction, on speed magnitude, with the port's frame ends aligned to the original's reads. That flatters the
  original, which reads the stick up to 33 ms after the edge (the port within 16.7 ms) and is still running forward at
  65 until it does. Do not re-derive it.

**IDLE-FRAME's bot adaptation (the main controller's ruling (a), 2026-11-14, logged for the owner; LATER 1053).** The
30 Hz read window is a pad's. The room's AI seats keep the per-tick idle test: CPU connections, seats the bots' brain
adopts, and the bot planner's own movers.
- **The switch:** `Walker.idleFrame`, laid by `MoverSim.prepare` from `MoverSim.ai` on every command. An adoption or a
  release switches it on its next command; the first person command after a release reads raw, and the hold starts
  from the second.
- **The planner's movers** (navigation's ladder sim, climbDiscovery's climb sim) are now marked AI. Before this branch
  they were silently a player's MoverSim, which under IDLE-FRAME would have held their synthetic stick. Marked AI, they
  run as they did on the base: a change back to the base's behaviour, not forward.
- **Why not the bots too:** a held mid-frame centre moved a bot 0.05 u at botCornerSlide's tick 99, sending it round
  the corner's other side, where it stalled. Applying the window to bots waits on their steering being hardened
  (LATER 1053).
- **What it does not touch:** replays and spectated bodies run no mover (they draw the room's snapshots), so they show
  people under IDLE-FRAME.

**A seam where page and room can part for one tick.** After the room drops a backlog (`Walker.elapse`) or after a page
`resume` that re-places the body against the room's `handBack` that does not, the two movers can hold different
last reads, or one none, so they decide a single mid-frame centre differently for one tick. They heal at the next
frame end, where both judge the centre alike (`mover.ts`, `idleRead`'s doc). The seam tests in
`throttleFrame.test.ts` ((h) resume, (i) long drop) drive flicks after the seam and agree, but no test places a
centre exactly on the first mid-frame tick after one. A test could: script the centre at that tick on both sides and
assert the one-tick difference and the heal. Not built.

**Synthetic drivers under IDLE-FRAME (2026-11-14; the main controller's rulings).** Every driver in the tree that hands a
mover a stick with no pad behind it leaned on the per-tick stop. These are the four classes, and how each was classed;
the next person writing a walking test will meet one of them.
1. **Bots and the bot planner's own movers: GATED** (a bot adaptation, LATER 1053). The room's AI seats
   (`MoverSim.ai`: a CPU connection, a seat the bots' brain adopts) and the planner's sims (navigation's ladder sim,
   climbDiscovery's climb walker, navigation's three probes) and the zombies' walker and obstacle probe keep the
   per-tick idle test (`Walker.idleFrame` false).
   Before this branch the sims were silently a player's.
2. **The hostage follower's walker: GATED** (a scripted body; `hostageFollow.ts` sets `idleFrame` false at
   construction).
3. **Test harnesses standing in for a page: NOT gated.** They are fixed to behave as a page would: let go, tick until
   the body has stopped, re-read the feet, and let go a frame's travel (|v| x `GAME_FRAME_DT`, the walker's own speed)
   before a turn past 60 degrees, as a player who knows the stop runs on. Example: `extractionWalkway.test.ts`'s
   `release` and `walkTo` (ruling A(i)). Widening tolerances or marking a harness pad-less is refused: either would
   hide what players get.
4. **The bomb-plant sweep's driver: NOT gated.** It is a page-like script whose stop is a person's release, so its
   walks overrun by up to a tick. It is traced per walk (`bombPlantSweep.parity.test.ts`'s comment): no reachable
   spot was lost.
A walking test with a scripted stick should say which class it is in.

**The stick stepped round the rim, and C2 at 50 ms (Q17 leg R; measured on the original running; a note for the
record, nothing built from it in the weekend batch).** The capture rig on the original running (r0004, MP2, two
clients, a standing runner; ten runs a leg; reads at about 0.8 kHz, so a time is read to about 1.25 ms;
shadow-relay-1's report as relayed by the main controller, `agent-mail/evidence/weekend-mega-2026-11-14/INTAKE.md`
section 38; files in the private bucket under `gate-runner/shadow/out/2026-11-15/q10-hitreg/q17-rim-sweep/` and
`.../q17-reversals/`, `score.txt` each; this note's author did not open them, and no repository harness scored them).
What the relay carried, and at what level, for the commanded speed --
- **proven**, n = 10, with its spread: a HELD rim position gives full speed at every step (64.93 to 65.07; never under
  95 percent of 65), 10 of 10, and the settled (lateral, forward) throttle per step is the same in 10 of 10;
- **measured, median only -- not proven** (the relay carried the median only, no spread): stepping the
  stick round the rim fast DIPS the commanded speed: a step every 17 ms to a median minimum of 51.41 (some runs 33.8),
  about 134 ms under 95 percent; every 33 ms, 54.19, about 100 ms; every 50 ms, 61.20, about 33 ms; 0 to 3 to 6 with
  33 ms on the middle step, 54.33, about 133 ms;
- C2 (the keys W, W+D for 50 ms, then D), n = 10: **measured, not proven** -- a median minimum of 29.82 with a range
  of 21.65 to 32.52 whose lower end is itself in doubt (the caveat below), so the range is no stated tolerance; about
  118 ms under 95 percent and full speed about 137 ms after the last edge, medians only (the reads resolve a time to
  about 1.25 ms, but the relay gave no run-to-run spread for these times).
No tolerance for a port test is set here: the relay's summary states none, and the tolerance a test holds these values
to is owed with that test (from the spreads in the `score.txt` files once opened). None of these values (Q17 R, C2, A2
below) has a capture holder yet: LATER 1036 names Q12's rows only; the holder of these is LATER 1071.
The limits the rig states: the sweep is STEPPED, not rolled; at RECRUIT (carried from 2026-11-14 for these legs, not
read on the screen until section 46) a raw 0.259 reads 0 and 0.866 reads full, so five distinct positions, not seven;
the speeds are the commanded velocity words, not positions. Whether the port's throttle frame (this section's ramp of
one 1/6 step a game frame, `agent/throttle-frame`, with IDLE-FRAME merged) dips the same way is NOT held by any test:
none steps the stick round the rim or drives C2's diagonal. The test that would show it is a
`viewer/test/throttleFrame.test.ts` case stepping the stick round the rim every 17, 33 and 50 ms and through C2,
reading the commanded speed's minimum and time under 95 percent against these medians; the strafing work (MISSION
R8.1) takes it. The CUSTOM / DEAD ZONE 0 legs were skipped: the options path to the slider is not yet found on the
rig.

**A caveat on the rim sweep's deep outliers, and the CUSTOM / DEAD ZONE legs (the rig, 2026-11-15; INTAKE section 46;
bucket `.../2026-11-15/q10-hitreg/q17-reversals-slider0/`).** The rig found a limit in its OWN stepping: a step change
is two window messages, and 2 of 60 changes in the CUSTOM control showed one frame with a neutral stick between two
non-neutral steps. So a single zero-axis frame between two commanded steps may be the rig, not the game: the rim
sweep's deep outliers above (runs dipping to about 34, and C2's 21.65) are IN DOUBT on that ground; the medians stand.
Nothing is to be built to a dip of 34. The CUSTOM legs, measured on the original running: the front end's CONTROLLER
OPTIONS offer RECRUIT / SAILOR / SEAL / CUSTOM with LOOK SPEED, ACCELERATION and DEAD ZONE sliders, and RECRUIT is now
read on the screen; **observed, n not given, not proven**: a CUSTOM setting holds through the online login, and
with DEAD ZONE at its left stop there is no dead zone (a raw 0.05 reads 0.047) where RECRUIT reads a raw 0.259 as 0;
**measured, median only, not proven**: the quick reversal (leg A2, 20 runs) at CUSTOM reaches full speed
63.5 ms after the last edge against RECRUIT's 285.5 ms, with a minimum speed of 49.69 against 0.00, and is under 95
percent of full for 66.5 ms against 300 ms; the rim sweep at CUSTOM (10 runs) has SEVEN distinct rim positions (five at
RECRUIT), and a step every 33 ms dips to a median 62.60 (RECRUIT 54.19), 8 of 10 runs never under 95 percent. The
CUSTOM sweep bears on the two limits above: seven positions at CUSTOM against five at RECRUIT put the five-not-seven
limit on the preset's setting, not on the rig; and the same stepping dips far less at CUSTOM, so RECRUIT's median dip
goes with the preset rather than with the rig's stepping (whose neutral frames, 2 of 60, were counted in this same
CUSTOM control). Much of the "sluggish reversal" the RECRUIT legs measured is the preset's setting (its dead zone at
least), not a fixed property of the game; where the ACCELERATION slider sat at CUSTOM is not recorded, so these legs do
not separate the ramp from the dead zone. (The rig's two calibrations from rest, 2 runs each, read the same rise of a
sixth a frame at RECRUIT and at CUSTOM with the dead zone at its minimum, only the end value differing; no leg was aimed
at the ramp itself, no other CUSTOM slider position was tried and no release-to-rest ramp was scored:
`agent-mail/evidence/weekend-mega-2026-11-14/rig/`, the relay's answer on push-apart, 2026-11-15.) The port: the presets
and the sliders are ui `src/stickTuners.ts` (`STICK_PRESETS` from `FUN_002da6c0` D:L179394-179419;
`STICK_PRESET_CUSTOM`; the DEAD ZONE slider `stickDeadZoneOfSlider`, D:L281942-281957, D:L179433-179438), and the move
stick takes the options' dead zone (viewer `src/camera.ts` `groundWish`,
`moveStick(..., this.law.options().stick.deadZone)`); whether the move stick's throttle ramp takes the preset's ramp
word (ACCELERATION) or stays this section's fixed 1/6 a game frame is NOT established, and no test holds either reading
against A2: the case owed is a `throttleFrame.test.ts` reversal at CUSTOM with DEAD ZONE at 0 reaching full
speed about 63.5 ms after the last edge, beside RECRUIT's 285.5 ms.
