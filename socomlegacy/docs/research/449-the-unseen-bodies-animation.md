# 449 -- The unseen bodies' animation (LATER 884, a region-gated body's pose)

- Date: 2026-11-18. Branch `agent/gate-pose` (worktree `wt-gate-pose`). The next batch's Wave 3, item 4: the main
  controller's order "884 hidden bodies posing, the parity question first (does the original animate unseen bodies?)",
  then its ruling (B) of the same day: no skip, this reading and the bench's close.
- Track: simulation for §1 (what the original runs for an undrawn body); product for §2 (the port's cost). Status: §1 is
  **reading, pending review** of this note.
- Evidence kinds, kept apart: **(D)** source inspection -- the decompilation and the port; **(U)** the port's
  disc-backed bench `viewer/test/bodyFrameCost.bench.ts` on the hub (Node 24, MP2's SEAL, single runs: read the size,
  not the digits).

## 1. What the original runs for a body it does not draw (D)

- The character's tick `FUN_00550ef0` (D:L418040-418462) steps and evaluates the body's animation for every actor it
  ticks, drawn or not. Its early returns (D:L418073-418114) are: the actor's byte `+0x105c` bit 6 clear (the word
  `piVar14[0x417]`'s mask 0x40), no controller (`+0xc0`), the controller's own tick (vtable `+0x10`) refusing, and posture 8. None of them reads the renderer's draw
  stamp (`node+0x98` == `DAT_004a4490`, research 329 §1.2) or tests the view.
- Its caller ticks every listed actor with no condition: the tick is slot `+0x18` of the vtable at `0x6691a0`, and
  `FUN_0029f430` (D:L145094-145108) calls that slot on every entry of the list at `DAT_004362e8`, itself run by the frame
  scheduler (registered at D:L50925). The draw stamp is not on that path (its review, 2026-11-18).
- The animation step `FUN_0057a330` -- the root-motion extraction on the posed nodes (D:L439147-439148) -- runs at the
  tick's end unconditionally (D:L418452-418455), followed by `FUN_00576860` and `FUN_00543030`.
- The draw `FUN_003374c0` (D:L235375-235483) draws a node's visuals and stamps `node+0x98` (D:L235479-235481); the scene
  walk `FUN_003389c0` chooses the nodes it draws (research 329 §1.2). Nothing read feeds a skipped draw back into the tick.
- So an unseen body's clip time, its clips' events (the footfalls, research 219 §4) and its posed nodes are current every
  frame. **Not read:** whether the PS2 builds its skinning palette (the VU's matrices) in the tick or in the visual's draw
  (its vtable `+0xc`, D:L235435).

## 2. The port, and why the skip was not built (D, U)

- The port runs the same per body each frame (`RemotePlayers.frame` -> `Play.frame` -> `Animator.step`, then
  `BodyView.setPose`); the region gate (`applyZoneGate`) only turns layer 0 off, so a gated body still poses (D). That
  matches §1 for the animator's step; the page's aim and hit marks also read the animator's pose (`Play.drawnBody`).
- The only work §1 would let a gated body skip is the renderer's side: `setPose`'s writes onto the bones and the bones'
  world matrices. The bench (U), us per body per frame at 16 bodies: `Animator.step` ~10 (~18 with the fire and reload
  layers), `setPose` ~2.5, `setPose` plus the group's `updateMatrixWorld` ~6.7, `RemotePlayers.frame` shown ~22. So the
  skip saves about 2.5 to 7 of about 22 to 27 us a gated body: some 0.1 ms a frame at sixteen. The controller's ruling
  (B): not built; the animator's own per-frame work and allocations, which every body pays, shown or not, are their own row.
- The gated case read more than the shown one in the bench's order ((d3) ~27 against (d) ~22). Interleaved in one run (a
  scratch bench, not kept: hidden, shown, the gate showing all, shown, hidden), the first case ran high (warm-up: 65 at
  one body) and the rest converged: shown again ~17, hidden again ~16, the gate showing all ~16 (U). A probe (not kept)
  counted the gate's tree walks: 8 over 120 frames of 4 bodies, none a frame after the first, the trees unchanged (U).
  So the gate adds no per-frame work; the difference was the run's order.

## 3. Not established

- The PS2's skinning palette's place (§1, the last point): it decides whether the original's undrawn body costs its
  draw-side skinning; it changes nothing seen.
- Whether a REMOTE copy's controller answers the tick: byte `+0x105c` bit 6 is the controller's answer, written by
  `FUN_00551ec0` from its vtable `+0xc` (D:L418525-418526) and skipped on another branch (D:L418511-418521: posture 8,
  `+0x1061` bit 5, or online with `+0xfcf` set). A copy whose controller answers 0 skips the whole tick, drawn or not --
  the gate is the controller's state, never the view, so the parity point stands; which copies it holds for is unread.
- §2's interleaved bench and the gate-walk probe were scratch runs, not kept in the tree.
- The bench's numbers are a shared host's single runs.
