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
