# 395 -- The own shadow's box from its hulls' vertices (the `agent/spc-2` proposal; a performance proposal)

- Date: 2026-11-09. The shadow PC's research loop (`docs/plans/2026-11-09-shadow-pc.md`, SPC.R4, the proposal note of
  step 5; SPC.R6, who decides): a turn of SPC-4 on branch `agent/spc-2` (SPC.R6's `agent/spc-<n>`), not the plan's
  SPC-2 task. "SPC-2" in the code's comments names this proposal.
- Track: **product** (OT.R53). It is a CPU-side browser adaptation behind a switch, **off by default**. The picture,
  the game, its timing and the wire are unchanged. No constant of the game's is named: no `*_READING` or
  `*_PLACEHOLDER`, and the ledger is unchanged.
- Evidence kinds, kept apart: **unit tests** (the box's identity); a **rendered browser run** (the identity on the
  real SEAL, and a CPU profile with the frame time).
  - The runs: the owner's second PC (RTX A4500, Chrome 157, WebGPU by Automatic), the test room solo on MP73
    (Sandstorm), MP2 and MP6, a 30 s walk each.
  - Not measured: a mid-tier device, the Xbox preset, a 16-seat match.

## 1. The theory (SPC.R4 step 1)

A profile of the test room's main thread on mega cb7125b1f (CDP sampling, 1 ms, a 30 s walk) put `charShadow.ts` at
5-14% of the samples on all three maps. `expandBounds` and `skinnedVertexPosition` take most of that.
- Every moving frame, the own shadow's box (`shadowBounds`, `FUN_0031a180`'s bounds; research 82) skins and
  transforms every vertex of the SEAL: 3,799 to 4,804 by map, the body, its gear and what it holds.
- CPS H8 already skips an idle SEAL's frame. A walking one pays in full.

The idea: a vertex moved by **one affine map** can be the box's extreme on an axis only if it lies on the convex hull of
the vertices that share that map.
- One affine map means a rigid mesh's vertices, or a skinned vertex with one non-zero weight. Grouped by (bone, weight),
  since the weight scales the map.
- A point strictly inside a convex set stays strictly inside under an affine map.

So the vertices inside their group's hull by more than a margin (`HULL_KEEP_MARGIN_ADAPTATION`, 1e-4 model units) are skipped.
Every vertex kept is computed exactly as before, so the box's extremes are the same values, and so are the shadow
camera's fit and the map. Kept in full:
- blended vertices (two to four bones);
- morphed meshes;
- groups under 16 points (`HULL_MIN_POINTS_ADAPTATION`), and groups three's hull cannot close (collinear or identical
  points, or fewer than four faces).

The identity's one limit: the margin times the map's smallest stretch times the weight must stay far above the
transform's rounding (about 1e-11 at these coordinates). A bone, a mesh or a weight scaled to nearly (not exactly) zero
could break it at that level, invisibly; no bone or body scale is set in the viewer today.

Sources: the convex hull's support property, as standard; three's `ConvexHull` (`three/addons/math/ConvexHull.js`,
r186). The SEAL's makeup was read in the page: 57% of its skinned vertices are single-bone, plus 1,705 rigid vertices.

What a player could lose: nothing, if the box is the same value for value. That is what §3 tests.

## 2. The change (SPC.R4 step 3)

`packages/viewer/src/charShadow.ts`:
- `setShadowBoundsHull(on)` is the switch, off by default (`shadowBoundsHull()` reads it; a test holds the default).
  **Nothing in a build sets it:** no page, flag or setting calls it, only the test. The runs below set it in the page
  by hand through the dev server's module. The bundle carries three's `ConvexHull.js` on every page that mounts the
  shadow, switch or not.
- `boundsPlanOf(mesh)` gives the vertex indices to read. It is made once per geometry and remade when the positions or
  the skin attributes change (their attribute and version).
- `expandBounds` reads a plan only under the switch.

Each plan's memory is one `Uint32Array` per geometry, about 14 KB for the SEAL, held in a `WeakMap` by geometry.

## 3. The proof nothing is lost (SPC.R4 step 4)

- **Unit** (`test/charShadowHull.test.ts`, 5 tests): over 300 random poses of a SEAL-like actor, the box with the switch
  on equals the box with it off (`Object.is` on all six numbers). The actor has a dense rigid mesh, plus single-bone,
  non-unit-weight and blended skinned vertices. The run also covers: the plan skips points inside the hulls and keeps
  every blended one; morphed, flat and tiny groups are kept whole; a plan is remade on a position change.
  - The pose loop was run once at 5,000 poses: green.
  - The first version grouped by bone alone. The test caught a 0.04 u miss at pose 68: a 0.9999-weight vertex is a
    different map from a 1.0 one. Fixed by grouping on (bone, weight).
- **Rendered, the real SEAL:**
  - The method: each frame of a 30 s walk computed the box both ways in the page and compared the two value for value.
  - MP73: 1,962 frames, 0 differ. MP2: 5,045 frames, 0 differ. MP6: 2,347 frames, 0 differ.
  - The plans keep 3,556 of 4,804 vertices (MP73), 2,858 of 3,799 (MP2) and 3,515 of 4,728 (MP6), about 75%.
  - The same box gives the same camera fit and the same map (`charShadow.ts`'s fit reads only the box). **CPS.R11's
    pixel gate was not run**: it is argued from the box's identity, not measured. Its pixel run on every cell it
    touches (SPC.R4 step 4, SPC.R6 (b)) is owed before the default is ever turned on.
  - The record: the second PC's bucket upload for 2026-11-09, `spc-2/` (host-local, not in git): `hull/identity.log`
    (the three identity runs), `hull/profile.log` (the timing legs, below), `prof1/` (the first profile, §1),
    `seal-composition.json` (§1's makeup), `timing-window.txt`, and the instruments `hullcheck.mts` and `profile.mts`.

## 4. The numbers before and after

The setup: a 30 s walk, in two rounds in opposite orders (off then on, on then off). Each leg is a fresh page with a CDP
profile running. The window was 2026-11-09T23:31:43-23:40:50Z, with the monitor paused and nothing else running.
- **Caveat:** the host's power guard fixed a reset to Balanced at 23:37:58Z, inside the window, so up to 5 min of
  round 2 may have run on Balanced. The plan resets about every 10 min on this host (the guard's log). Round 2's MP73
  legs are the ones most exposed.

| map | `charShadow.ts` self, off (r1 / r2) | on (r1 / r2) | rAF work mean ms, off | on | p99 ms, off | on |
|---|---|---|---|---|---|---|
| MP73 | 1663 / 2033 ms | 1174 / 1107 ms | 14.03 / 12.49 | 14.07 / 13.63 | 20.8 / 19.5 | 21.3 / 18.8 |
| MP2 | 4157 / 4269 ms | 2761 / 2755 ms | 4.45 / 4.26 | 4.37 / 4.33 | 7.3 / 7.6 | 7.2 / 7.2 |
| MP6 | 2819 / 2740 ms | 1817 / 1783 ms | 10.45 / 10.50 | 10.35 / 10.41 | 15.0 / 14.3 | 14.9 / 14.6 |

- The file's own cost falls by 29-46% on every map and in both rounds (MP73 29.4 / 45.5%, MP2 33.6 / 35.5%, MP6
  35.5 / 34.9%). Over each leg's own rAF frame count (2,114-6,724 frames, `hull/profile.log`) that is 0.21-0.41 ms of
  sampled main-thread time per frame on this host, under the profiler.
- The plans skip 25-26% of the vertices, and the skipped ones are the cheapest kind (rigid, or one bone), yet the
  file's time falls by about 34% in four of six pairs. The record does not explain the gap (a profiler attribution
  effect is possible); reading the profiles by function is owed.
- The frame's own work (the rAF callbacks timed, without the profiler's weight) does not show it beyond the
  run-to-run spread at n = 2. The 1% low (p99) is no worse outside the spread.
- So it is a real saving in the file, too small on this host to see in a whole frame.

## 5. Risk and recommendation

- **Risk.** Low.
  - The box is the same by construction and by test; a wrong plan could only drop an extreme vertex. The unit test
    found the one way that happened (the weight) before it shipped.
  - A model with morphs or a degenerate group falls back to every vertex.
  - The plan is built once per geometry: ~3,800 points and their hulls, estimated at a few ms (not measured).
    `warmSetup` builds it for the body present at the warm-up, off the drawn frame; a geometry that appears later (a
    weapon swap, a new kit) builds its plan in a drawn frame. That belongs in the mid-tier check's 1% low.
- **Recommendation: adopt behind the switch now, and leave the default off** until one check on a mid-tier device or
  the Xbox preset. No build can turn it on yet: wiring a dev flag is that check's first step, not this change's.
  The check: the 1% low no worse, and peak memory not higher (SPC.R6 (c)). The saving should matter most where
  the CPU is weakest; this host's A4500 desktop cannot show it.
  - If that check is not run, **park it**: the gain on this host is below the frame's noise.
  - Either way it is the controller's call under SPC.R6 (a)-(d). Nothing about the picture changes, so it is not
    Craig's.
