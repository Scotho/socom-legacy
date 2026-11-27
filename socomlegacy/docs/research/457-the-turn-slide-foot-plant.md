# 457. The turn slide: the standing turn in place's foot plant (R4P-301, LATER 1416)

*Simulation track. Written 2026-11-24 by seat-move2 (Claude
Opus 5.5). Every value here is **reading, pending review** unless it says otherwise; the capture score IQ-178 is owed
before the merge.*

## 1. What the original does

Standing, the stick at rest, the rifle LOWERED, a turn in place slides the feet: C8 (IQ-056), IQ-063, C7 and C7B
(FEELMV-C7B-PC2) measured path ~4.7-5.5 u and net ~1.6-2.5 u over a 1.5-2.0 s full look turn. With the rifle up,
crouched or prone, 0.000. IQ-100 and IQ-103 (FOOTPLANT-PC2) measured the feet's step equal to `+0xf44` within 1e-5
over 6,494 pairs, and the plant off exactly while the raise weight is not 0. IQ-104 (FOOTPLANT-REMOTE-PC3) measured a
remote body within 500 u planting on the viewer's console. Those are the captures' own numbers, carried, not
re-measured here.

## 2. The mechanism (read)

`docs/atlas/readings/turn-slide-foot-plant.md` (atlas-parity, Fable), its Codex second read, atlas-waves' re-read and
its four answers (2026-11-24):
- **The plant.** r0004 `FUN_00553870` (D4:L455508-455563; r0001 `FUN_0054ea80`, D:L416913-416969) is called right after
  the mover writes `+0xf44` = dt x velocity (D4:L455110-455118). It overwrites the displacement:
  `+0xf44` = anchor - R(`+0x70`) x footPoint - position.
- **The gates.**
  - `+0xe0` bit 2: the camera body, or up to 3 bodies within 500 u (`FUN_00557a10`).
  - Both foot nodes exist.
  - The top action loops, with `+0x105e` bit 4 set.
  - Posture `+0x174` 0.
  - The mode word `+0x133a` 0.
  - `+0x1061` bit 3 clear.
  - The RETURNED raise weight (`FUN_00288020`) exactly 0.
- **The foot.** Inside phase 0.65 +/- 0.2499 (inclusive) the right foot, else the left (0x64e458, 0x64e460). Its point
  is 1.09 along local x (0x41eb10).
- **The latches.** A set bit reuses its anchor. Planting one foot clears the other's bit, so every swap latches afresh
  (D4:L455540-455544, D4:L455551-455555). TurnSetup `FUN_005be840` (D4:L512893-512903; r0001 `FUN_005b8270`, D:L471429-471439) clears both bits only at the push
  of a new Step.
- **The latch frame.** The node's matrix from the last apply (`FUN_0054cf30`, D4:L454188-454193): the previous facing
  and position, with this tick's pose (D4:L455539-455541).
- **The phase.**
  - At the push: StandTurning `FUN_0058b680` (D4:L485313-485362) carries the old looped top's phase through PushBlend
    `FUN_0028f020` (D4:L142910, D4:L142975-142978), and sets 0.5 when trunc(phase x 60) is in 17..47
    (D4:L485347-485353).
  - Its rate is signed weight x speed x K / T (`FUN_0028e900` D4:L142602, `FUN_0028d880` D4:L141990-142045), with the
    speed from `FUN_00588f60` (D4:L484159-484205).
- **The order.** The body tick `FUN_0057f580` and the cross-fade `FUN_0057bc40` run before the mover (D4:L457158-457159), so the plant reads the faded
  pose.
- **The cross-fade** (atlas-waves' non-author second read, 2026-11-24; reading, pending review): SmoothAnims r0004
  `FUN_0028f460` (D4:L143053-143076; r0001 `FUN_0028e0d0`) blends every part with flag `+0x42` bit 0 -- the
  translation lerped toward the saved one by w, the rotation slerped toward it (`FUN_00323e80`, the shorter arc; a
  normalised lerp above a dot of 0.95) -- and every part is built with the bit, the root and the feet included (the
  push `FUN_0058e160` takes `skel_root` out for the landings only). `FUN_0057bc40` (D4:L477267-477362) runs
  `+0x178 -= dt`, w = ease(`+0x178` / `+0x17c`), the ease `FUN_00288880` (2x^2 to 0.5, then 1 - 2(x - 1)^2) running
  1 -> 0, the pose starting at the snapshot; the length is the pushed motion's BlendTime (`+0x20`; 0.4 if none). The
  snapshot is the previous tick's DRAWN pose (`FUN_0057b6c0` in the post-tick `FUN_00555800`; all parts while no fade
  runs, `FUN_0028f770` D4:L143157-143182). After the cross-fade a second 0.4 s fade (`+0x10d0`, `FUN_0057bae0`) may
  run; the cross-fade wins while both do. The plant's point `FUN_00287d60` composes the foot's chain from the fields
  SmoothAnims has just written. The root's x/z are zeroed by the step branch (`FUN_0057f580`, D4:L479633-479672).

## 3. The port

`packages/viewer/src/footPlant.ts` (pure, headless) and three small hunks in `packages/viewer/src/mover.ts`:
- the walker's `footPlant`, its leg posed from the clips page and room load (`setTurnStepClips`: `play.ts` with its play
  data, the match server with `loadSimClips`, whose list gains `seal_step` and `seal_stand`);
- `plantTick` before the ground state's move, and once a tick otherwise;
- `slideOrMove` taking the plant's displacement, with the velocity left as it was.

Page and room run the same walker code on the same commands (`net/moverSim.ts`), so they plant identically. A replay
that builds a new mover keeps the plant's state, which is the walker's (`test/turnSlide.test.ts`). The design was
approved by the main controller and seat-kill (2026-11-24, with conditions), under seat-walls' five conditions.

## 4. Readings (named in the code)

| Name | What it holds | Level | What settles it |
|---|---|---|---|
| `TURN_SLIDE_MECHANISM_READING` | the plant in the walker; its leg posed from the LOADED `seal_step` and `seal_stand` (`setTurnStepClips`: the page's play data, the room's sim clips; no table in the source, RS.R8), eight bones, `sampleClipInto`; without the clips no plant; its phase the walker's clock | reading, pending review | IQ-178 re-score (the randomized-idle rig) |
| `TURN_STEP_CLIPS_READING` | the rates 1/0.65 (the Step) and 1/6 (the idle, raised or lowered: the Fire idle an overlay on the same play -- Tick_0 `FUN_0057f580` takes the raise weight at D4:L479363 and attaches the Fire version at D4:L479393 through AddOverlay `FUN_0028d160`, which copies the node's speed, D4:L141720-141731) and the BlendTime 0.9 (`motion.rdr`) | the rates: reading (the disc, pinned); the overlay: reading, pending review (atlas-waves; a re-read at r0004 owed, and the raise weight's function at D4:L479363 -- `FUN_00287f10` in the atlas reading, `FUN_00288020` in `footPlant.ts` -- to reconcile) | -- |
| `FOOT_PLANT_LATCH_READING` | latch per swap, the anchor reused while its bit stays set | reading, pending review | IQ-178 per-frame latches |
| `FOOT_PLANT_LATCH_FRAME_READING` | the latch at the previous facing and position | reading, pending review | IQ-178 |
| `STEP_START_PHASE_READING` | the walker's idle clock from 0 at the idle's start (a play with no old top starts at 0: PushBlend with no current top, D4:L142903-142907, and `FUN_0028dfa0` D4:L142265-142275), at 1/6 a second raised or lowered (*was*: 1 a second raised, retired on atlas-waves' read); a walk's or run's phase carried into the idle is not tracked | named departure | a capture of a turn begun within one idle cycle of stopping |
| `TURN_SLIDE_RIFLE_UP_READING` | the raise gate on the walker's own envelope, fed by the command's raise state (ER-2), the rifle's times for every hand | reading, pending review | IQ-178 rifle-up leg; a pistol leg |
| `TURN_SLIDE_BODIES_READING` | a player's own walker plants; no bot, no remote copy | named departure (IQ-104 captured remote planting) | LATER 1491 (remote bodies within 500 u) |
| `FOOT_PLANT_SLIDE_READING` | the anchor kept while a slide or a wall moves the body (the review's F3: drawn back 1.6-2.7 u off a 55-62 degree face) | named, unread | a capture of a rifle-down turn at a slope's foot |
| `FOOT_PLANT_FADE_READING` | the cross-fade per bone: each of the leg's eight bones' translation lerped and rotation slerped toward `seal_stand`'s first key by the eased weight (ATLAS's second read, section 2); the original's snapshot is the previous tick's DRAWN pose (with the rifle lowered, `seal_stand` at its phase: under 0.005 from its first key), its blend a normalised lerp above a dot of 0.95, else a slerp (the port's the same), and a second 0.4 s fade on `+0x10d0` (`FUN_0057bae0`) runs after it, not built | reading, pending review | IQ-178 re-score |
| `TURN_SLIDE_GATES_READING` | the mode word `+0x133a` and `+0x1061` bit 3 taken as passed on a player's walker | named departure | a read of `+0x1061` bit 3's writers |
| `TURN_SLIDE_CLUSTER_RUN_READING` (*note only*) | IQ-178 A2's six low-cluster left turns came CONSECUTIVELY (trials L7-12), which looks like a state carried between trials rather than a random start phase; the port draws the start phase from its idle clock alone | open | a run of the original logging, per trial, the start latch (`+0x1060` bits 6/7) and the Step's phase at its push |
| `TURN_SLIDE_STEP_ENTRY_READING` (*note only*) | the original's right carried trials enter the first Step ~0.011-0.025 of phase after the push (MP2, flat), the page's at +0.0014 | open | a read of the push tick's phase writes on a right carried start, or a per-frame capture of `+0x1c` around the push |

## 5. Not built here

- **Remote bodies.** Up to 3 bodies within 500 u planting on a viewer's page (IQ-104): LATER 1491, on the controller's
  ruling of 2026-11-24.
- **The straddle.** While the envelope releases mid-turn (~4.3 u in 0.43 s, IQ-063), the step branch carries the root's
  travel. The mechanism is inferred, not read: LATER 1492.
- **The plant's two contact clamps and r0004's weapon-wall veto.** Passed to seat-movement and seat-walls.
- **The plant once a game frame** (the original's mover cadence) rather than per 60 Hz tick: LATER 1517, with the 30 Hz
  probe on A3 (section 7) as its evidence.
- **A page rewind test** (`saveState` / `restoreState` and a re-run) holding the plant: LATER 1500 (the review's N1).
- **A side without the clips** (no `MOTION_P.ZAR`) runs with no plant while the other has one; the match server logs it
  (seat-walls' owner note). The clips are module-level, one set per process.

## 6. Evidence so far

- **Unit tests, run on PC 4.**
  - `test/turnSlide.test.ts`, 11 of 11, covering:
    - the speed pin and the foot window;
    - the walker's steps equal the plant's, tick for tick;
    - rifle up, crouched and prone give 0;
    - a replay keeps the plant;
    - no turn, no slide;
    - a placing mid-turn starts no half-step (the review's F2);
    - a slide's exit leaves no step to a later tick (the review's F1);
    - the stick pushed left from a start snapped to 0.5: A2 low's net and path per degree.
  - `test/footPlantDisc.test.ts`, 5 of 5, against the disc's (or the fixtures') MP2, MOTION_P and READERC: the plant's
    posed point equals the port's own skeleton pose (`writePose`) to 1e-4 at every key and half key, on every MP2 model;
    the leg's parents; the stand's spread; mid-fade (w 0.2 / 0.5 / 0.8 at five phases) the point equals the skeleton
    posed from the leg's bones blended by an independent copy of the read's rule, to 1e-4 (the old point fade fails it
    by 0.038 u: a scratch mutation, reverted); the wiring (`SIM_CLIPS` and `PLAY_CLIPS` carry both clips); the rates.
- **The bone fade against (B)** (an inference): through the walker (`MoverSim`, the unit test's `lawRun`, a 166.4-degree
  turn), the stick-left start snapped to 0.5 gives net 0.473 and path per degree 0.03211 (A2 low's bar: 0.27-0.51,
  0.03160-0.03296); the `FootPlant`-alone probe over every start phase gives the low cluster net 0.492, path per degree
  0.03266; the high cluster net 2.431 (1.69-2.80), path per degree 0.02988; the stick-right main
  cluster net 1.883, path per degree 0.02813, its low (4 %) 1.276. PC 3's page trace (TURNSLIDE-TRACE-PC3) shows the
  walker's phase carry working on the page (a 1625 ms wait landed high, a 98 ms one low): (B)'s one cluster was the
  four trials' starts, not a fixed phase.
- **The model against the capture.** IQ-178 (A), the original (PC 3, r0004, 13 trials): net 1.743 sd 0.180, path
  4.688 sd 0.262; rifle up, crouched and prone exactly 0. The main controller's bar: (A)'s mean +/- 2 sd (net 1.38-2.10,
  path 4.17-5.21). Through the page's own look law (the push's ramp: 2.90 rad over 1.5 s, not 3.35 from a full-rate
  start) over 52 start phases across the lowered rifle's idle:
  - the stick pushed RIGHT (yaw decreasing, -166.4 degrees: every (A) trial's turn, dyaw -161..-166): net mean 1.795
    (1.16-2.23), path mean 4.718 (4.30-5.03), against (A)'s 1.743 and 4.688; `test/turnSlide.test.ts` asserts the means
    inside the bar;
  - the stick pushed LEFT: net mean 1.41 (0.48-2.78), path mean 5.25 (4.60-5.50). IQ-178 A2, the original's left
    turn (16 trials): BIMODAL, a high cluster (10) net 2.617 +/- 0.105, path 5.000 +/- 0.131 and a low cluster (6,
    consecutive: `TURN_SLIDE_CLUSTER_RUN_READING`) net 0.387 +/- 0.061, path 5.281 +/- 0.089; path over all 5.105 +/-
    0.181. The model splits the same way (a scratch probe, 360 start ticks over the idle): the low cluster is exactly
    the starts the push snaps to phase 0.5 (trunc(phase x 60) in 17..47, D4:L485347-485353; 31 of 60 phases), net 0.479,
    path 5.495; the high cluster net 2.386 +/- 0.317, path 5.003. The right turn likewise: a 4 % low cluster at net 1.168
    against (A)'s one trial at 1.171. An INFERENCE for the snap (a scratch probe, not a score); the low cluster's net and path (0.48 / 5.50 against 0.39 /
    5.28) and its spread are open, perhaps the fade's snapshot (`FOOT_PLANT_FADE_READING`).
  - The controller's bars for (B): right as above; left, each trial's path in 4.74-5.47 and its net in one original
    cluster (high 2.41-2.83 or low 0.27-0.51), both clusters seen over >= 16 trials.
  - An earlier figure (path 5.46-6.82) came from the test's full-rate turn, not the plant.
  The page leg IQ-178 (B), scored by a non-author against the same bar, decides the merge.

## 7. The phase-matched score and the right-turn residual (2026-11-24)

**The bar** (the main controller's, set before the page trials were read): each page trial against the mean of the
original's trials within +/-0.02 of its start phase, same direction; net within 0.20 u, path within 0.35 u; the snap
window's edges within 0.02; controls exactly 0; at most one named edge-slope miss per direction. A page trial within
0.02 of its own snap edge whose originals lie across the original's edge is judged by the edge clause alone.

**IQ-178 (B), phase-matched, on d2f41bedbe** (= 03f54ac269's simulation; PC 3, a non-author score):
- the snap EDGES agree on all four (the original's measured edges within 0.0094 of the page's exact [0.2833, 0.8000));
- the LEFT passes on same-side averaging (the controller's reading, made after the data; the literal reading gives
  10 misses);
- the RIGHT fails: carried starts at 0.86-0.89 and at 0.0094 run +0.21 to +0.29 above the original; snapped starts
  and the controls are in tolerance.

**The hunt** (every candidate read-backed, none tuned; atlas-waves' reads Q1-Q6, pilot/movement/R4P301-snapshot-fade-
read-atlas.md, SECOND READ UPHELD (pilot/movement/R4P301-snapshot-fade-read-atlas.second-read.md: Q1's two sentences
corrected, its answer standing); seat-move2's probes are scratch copies of the plant, inferences):
- the fade's length; the timer's first-frame order (Q3: decrement first, as the port): no fix;
- the fade's SOURCE (Q1: the previous tick's drawn pose, the idle at the carried phase, root x/z zeroed): no effect,
  the idle's leg moving under 0.005 over its keys;
- the second 0.4 s fade (Q2: `+0x10d0`, set by second-channel body overlays only): not on the turn's path;
- the Step's first-frame speed (Q4: its own signed speed from the first frame) and the idle's speed kept for a carried
  push's first frames (probed): no fix;
- a direction-dependent start (Q5: the sign enters only as the negated speed; no mirrored play): none;
- the slope (the original's captures ran on MP5's 15.7-degree spawn face, the page on MP2's flat ground): a least-squares
  fit of a constant drift over the original's 75 net vectors gives d ~ 0 (0.012 u) and removes nothing;
- the looped sampler (Q6: frame = floor(phase x n), n the clip's frame count, the last segment to key n, phase 1.0
  kept: the port's way; the 16 looped clips whose last two keys repeat key 0 pause over the last 1/n in the original
  too) and its seen-body blend (slerp only within fractions 0.01-0.99) and nearest-key translation: no fix;
- the plant once a game frame: the right's upper band closes, the left goes out: mixed (LATER 1517).
By the original's net vectors the right carried excess is a LENGTH, not a direction: the page's slide points the
original's way and runs ~6-8 % (A3 set) to ~12-15 % (PC 3's bands) long. The cause is not found in the original's
code as read.

**The matched FLAT re-score** (the controller's standing rule once the spots were found to differ; PC 3, MP2's SEAL
spawn (707.4, 100.0, 493.4), floor (0, 1, 0), the original and the page alike, a non-author score): LEFT 14/14, RIGHT
16/16 in tolerance, none unscored, the controls 0. Right carried 0.835-0.894: page 2.101-2.221 against the original's
same-side means 2.067-2.106 (dnet +0.020 to +0.153); near 0, +0.019 to +0.151; snapped -0.017 / -0.021. Left carried
-0.129 to +0.121; snapped 0.40 +0.186, 0.60 +0.127. The MP5 verdicts above are SUPERSEDED: they compared the page on
flat ground with the original on MP5's 15.7-degree spawn face.

**The slope, explained only in part** (an inference): the right-carried excess on MP5 came from the face, yet a
constant drift fits none of it (d ~ 0 over 75 net vectors). So the slope's effect on the original's plant is NOT a
uniform push. It depends on the turn's direction and phase, e.g. through the planted foot's height on the face (the
anchor and the model-space point are 3-D, and the apply takes the height from the ground) or the Step's foot heights
against an inclined floor. The port's plant on a sloped floor is not scored: a capture on a known slope, original and
page, settles it (a candidate row for the movement owner).

**Outside the bar, noted** (`TURN_SLIDE_STEP_ENTRY_READING`, open): on MP2 the original's RIGHT carried trials enter the
first Step ~0.011-0.025 of phase after the push, the page's at +0.0014 (the left, both ~+0.0001). Unread; a candidate
for the slope row or the next read.

**Verdict: PASS** on the matched flat re-score (record `TURNSLIDE-FLAT-PC3`), by the controller's literal bar: 0 misses
over the 30 matched trials. The closest are L 0.3961 (net +0.186, matched to one original trial, F-L-13 at net 0.265,
the lowest snapped left seen: a thin margin) and R 0.8944 (+0.153). R4P-301 merges on its bar at 03f54ac269.
