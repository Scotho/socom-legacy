# 456 -- The round's end puts the fog's own colour back over the goggles' tint (R4P-234)

- Date: 2026-11-23. Branch `agent/patches-r4p234-fog` (worktree `wt-patches-r4p234-fog`), base the trunk `agent/next`
  ed663a0ad9 (the v0.4.31 cut head; first built on 47c40d92f6); the claim PATCHES-R4P-234 (HANDOFF s3, made exact
  2026-11-23T11:33Z, widened to this note and its 101 rows 12:05Z). The task is the main controller's
  (seat-controller-q, through the atlas seat), the r0004 parity-ready queue's row 48 (R4P-234, R4-007-2).
- Track: simulation. Status: **reading, pending review**, held by forced captures (below).
- Evidence kinds, kept apart: **(D)** source inspection of the r0004 decompilation (`D4:L`) by this note's author; **(P)**
  atlas-parity's source read of the same function and the zoom module (reading, not yet reviewed by a non-author);
  **(C)** forced captures of the original running (r0004, PCSX2, PC 2): Q-234 / IQ-121 (Q234-PC2), Q234B, Q234C / IQ-126,
  filed in the atlas's ready queue row 48 (`agent/spc-atlas`, `socomlegacy/docs/atlas/handover/r0004-parity-ready-queue.md`).
  A forced capture enters the function by an instrumented call, not the game's own round end; the real round end played
  through is owed to a person's play (the queue's route 2, not blocking).

## 1. What the original does at a round's end (D, P, C)

r0004 `FUN_002ac270` (r0001 `FUN_002aa910`; research 397 measured it running at an online round's end, its projectile
calls) does, in its own body (D4:L159739-159800), after its other calls:
- D4:L159788: `FUN_0029c7f0(1.0, cam)` (r0001 `FUN_0029b2f0`, `CAppCamera::SetZoom`; research 84) on the app camera
  `*0x4429b0` (research 314): the camera object's field of view for a zoom of 1.0 (its `+0xb4` sub-object's `+0x470/+0x474`
  scaled by 1.0, `+0x2c8` = `+0x2cc` / 1.0; P).
- D4:L159789: the camera's `+0xe4` byte = 0 -- its zoomed / first-person view byte, which the zoom module's
  `FUN_001f1610` sets to 2 when a zoom leaves 1.0 and back to 0 at 1.0 (D4:L58227-58263; P; research 84 for r0001).
- D4:L159790-159797: the colour `+0xd0..+0xdc` of a DIFFERENT object, the fog object `*(DAT_0045f750 + 0x128)` (loaded at
  D4:L159790; the object `FUN_001f1470` sets the fog's distances on, D4:L58181-58208), not the app camera = the saved colour
  at `0x4b82f0` (D4:L159794-159797).
- **r0001 differs:** `FUN_002aa910` (D:L151203-151253) ends with `FUN_0029b2f0(1.0, *0x415ff0)` (D:L151250) and the
  `+0xe4` clear (D:L151251) and returns (D:L151252): it has NO colour write. The colour restore is r0004's addition; the port
  follows r0004 (OT.R97). Research 397's measurement of the function running at an online round's end is of its moment, not
  of the colour.

Captured (C):
- **The colour** -- Q-234 (3/3) and Q234C (4/4): with the goggles on, the fog object's `+0xd0..+0xdc` (the ready queue's row calls it the camera's) goes from the goggles'
  tint (0, 0.02, 0, 0) to the saved (0.2902, 0.2902, 0.2824, 0) -- the fog's own; with them off it is equal before and
  after (3/3).
- **The goggles stay on** -- Q234B: the actor's `+0x200` (0x103) and `+0x204` (1.01), the zoom `DAT_004074c0` (1.01), the
  active flag `0x435610` (1) and the saved byte `0x4074c8` (0) are unchanged at the return and 3 s later. The function
  touches none of the zoom module's own state (P); its callees are unread, and the capture shows none of them clears it.
- **The camera's field of view** -- Q234C (4/4): 1.0 at the return and still 1.0 3 s later, the zoom state kept. When the
  zoom's field of view comes back is unread.

## 2. The port (D)

The port's moment for this function is ROUND_END_EFFECTS' (research 283 s9-s10): `NetPageDeps.roundEndEffects` at the
engine's read, `ENGINE_READ_S` (3 s) after the `roundOver` (`netPage.ts`), wired in `matchThrow.ts`. There the firearm's
new `roundEndFog` (`matchFirearm.ts`) asks `refreshFog(null)` -- the fog's own colour, not the lens's product -- while,
and only while, the fog carries the goggles' lens (`lensOn === 'goggles'`). It leaves the view's state and the lit colours'
lens as they are, so the goggles stay on (`ROUND_END_GOGGLES_READING`), and the view's writer re-tints the fog only at the
next change of the view; it does not touch the field of view (R4P-234b's `roundEndView`, `zoom.ts` `ROUND_END_CAMERA_FOV_READING`, holds it at 1.0 at the same moment). With the goggles off it
does nothing. The port's camera keeps no separate view byte: it derives its scoped mode and its field of view from the zoom
every frame (`viewFrame`, `camera.ts` `setZoom`), so `+0xe4` has no counterpart to clear. Held by
`packages/viewer/test/roundEndFog.test.ts`.

The field of view's reset -- the camera at 1.0 from the round's end while the zoom stays -- is R4P-234b's (seat-bugs, merged;
`ROUND_END_CAMERA_FOV_READING`, research 84 s7.3), not this task; this note's `ROUND_END_CAMERA_FOV_PLACEHOLDER` is retired
(2026-11-24).

## 3. Readings and placeholders

| Name | Value | Basis | Level |
|---|---|---|---|
| `ROUND_END_GOGGLES_READING` | the goggles stay on | s1: Q234B (the actor's `+0x200`/`+0x204` and the zoom module's three globals unchanged at the return and 3 s later); the function's own body touches none of them (D4:L159739-159800) | reading (held by a forced capture), pending review |
| `ROUND_END_CAMERA_FOV_PLACEHOLDER` | not reset | s1: the camera object's field of view for 1.0 (D4:L159788), measured at the call by Q234C (4/4: 1.0 at the return and 3 s later, the zoom kept); the hold's end unread; the follow-up R4P-234b (seat-bugs) | retired (2026-11-24): R4P-234b's `ROUND_END_CAMERA_FOV_READING` holds it |
