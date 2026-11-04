# 232 -- The view as built: the scaled range, the view range, the last copy, the detail pass, the spectator's pad (web sprint 29)

- Date: 2026-10-06 (web sprint 29). PF-29 writes §0-§3, its §6 rows and §7; PF-30 (§4, its §6 rows) and PF-31 (§5,
  its §6 rows) add theirs. 2026-10-15 (web sprint 40, AD-1; reconciliation C13): §8, the aim's reach -- the camera's
  MID read and used as the eye's aim ray's cap -- and §2's and §6's corrections (the `.bss` floats' writer found).
- Status: **reading, pending review.** Every value below is a read of the decompilation (`D:L<n>` of
  `socom2_game.elf.decomp.c` r0001), of the ELF's `.data`, or a value read live in RDRAM dumps, as research 188 gives
  it; nothing here is a new capture. Research 188 grades U1 and U3 STRONG and U5 PROVEN, and its verification (V4,
  claims 31, 32 and 34) CONFIRMED all three; under AGENTS.md a source read is a reading until reviewed (research 206).
- Sources: research [188](188-c9-world-render-platform.md) §2.1 (U1), §2.3 (U3), §2.4 (U4), §2.5 (U5), §7.2-§7.5
  (the verification); [84](84-accuracy-and-recoil.md) §7 and §9 (the view states, the applied magnification); HUMAN_TASKS
  H92 (the owner, 2026-10-04: the last LOD copy). Ruling PF.R49 (the controller, 2026-10-06).
- Code: `packages/scene/src/lod.ts` (`scaledRangeSq`, `LOD_SCALE_READING`, `LOD_LAST_KEPT_RULING`, `lodOpacity`'s
  doc), `packages/viewer/src/zoom.ts` (`RenderView`, `DEFAULT_RENDER_VIEW`, `VIEW_RANGE_EXTRA_READING`,
  `viewRangeExtra`, `Zoom.renderView`), `packages/viewer/src/fog.ts` (`extendFog`, `extendFar`; `applyFog` keeps its
  base), `packages/viewer/src/world.ts` (`WorldView.frame(camera, dt, view?)`, the detail fade's `rangeScale`).

## 0. The answers

| question | answer | source |
|---|---|---|
| The range a LOD band sees under zoom | the range squared over the magnification on screen, once: `range² / m` (at 9x the bands act 3x closer) | `FUN_00290aa0` D:L137045; `FUN_0029b2f0` D:L142693, D:L142705; 188 U1 |
| Which ranges | the LOD, the detail gate (`DAT_004b4a98`) and the alpha pass's sort key | `FUN_003374c0` D:L235405-235418, D:L235458-235469; 188 U1, U2 |
| The view range | +200 in night vision (state 3) and the binoculars (state 4), +300 in every scope (states 5-12), 0 otherwise; restored on every state change | `FUN_001f0750` D:L52939, D:L53049, D:L53075, D:L53159; 188 U3 |
| What it moves | the fog's far (`cam+0x128`), the far clip (`+0xf0` / `+0x2ec`), the mid (`+0xec`); the near not | `FUN_001f1470` D:L53202-53255; 188 U3 |
| The aim's reach (AD-1) | the eye's aim ray is `min(max(range, 600), cam+0xec)` long: the held item's range floored at 600, capped at the map record's MID (0x2C) plus the state's extension | `FUN_005aa6e0` D:L464097-464114; §8 |
| The last LOD copy | the game culls it at `[4]` like every copy; the port keeps it, by the owner's word | `FUN_003b7b90` D:L308899+; 188 U5; HUMAN_TASKS H92 |

## 1. The scaled range (PF-29, `LOD_SCALE_READING`)

`CPipe::RenderVisual` (`FUN_003374c0`) hands `DrawLOD` the value of `FUN_00290aa0(camera, node position)`
(D:L235458-235469), which is `cam[+0x2c8] x |p - cam|²` (D:L137045). `+0x2c8` is written only as `cam[+0x2cc] / m` by
the projection setter `FUN_0029b2f0(m)` (D:L142693, the write D:L142705; also D:L140528), fed the applied
magnification `DAT_003dc338` (D:L52802; research 84 §9). `+0x2cc` is 1.0 at the camera's init (`FUN_00293a80`
D:L138731-138732) and read live 1.0 on M51 and Frostfire (188 U1, `camera_rdram.out`). So the range squared is divided
by `m` once -- not `m²`: Frostfire's `railings_low` (band 100-120 / 420-440) at 500 units is past its far fade at 1x and
on its plateau at 9x (500²/9 = 166²).

**As built.** `scaledRangeSq(rangeSq, magnification)` (`scene/src/lod.ts`) divides once; `WorldView.frame` passes each
LOD copy's `scaledRangeSq(|at - camera|², view.magnification)` to `lodOpacity`. The magnification is the run's applied
value on screen (`Zoom.magnification()`), not the state's target: the bands follow the zoom as the FOV does.

- **The detail pass** (today's W1.6 per-fragment fade, `materialSpec.ts` `detailWeight`): its plain range is multiplied
  by one uniform, `rangeScale = 1 / sqrt(m)` (the same range² / m), written by `frame`. PF-30 replaces the fade with
  the per-visual switch at the centroid's scaled range² (§4) and reads the same `RenderView.magnification`.
- **The alpha pass's sort key** (`ALPHA_PASS_SCALE_READING`, note only): the game sorts by the scaled range²; one
  positive factor on every key leaves the order unchanged, so `reorderAlphaPass` keeps the plain range, a comment
  saying why. No test.

**The shape PF-30 builds on (stable).** `RenderView = { magnification: number; farExtra: number }` (`viewer/src/zoom.ts`),
`DEFAULT_RENDER_VIEW` `{ 1, 0 }`; `WorldView.frame(camera, dt, view?: RenderView)`, the view optional so nothing
changes until the two frame loops pass it (§7).

**Tests.** `packages/scene/test/lod.test.ts` "lodOpacity at a scaled range: range² / magnification (FUN_00290aa0
D:L137045; FUN_0029b2f0 D:L142705): Frostfire's railings_low band (100-120 / 420-440) at 500 u is 0 at 1x and 1 at 9x
(500²/9 = 166²)" (also 3x and 1.5x on the plateau; the mutation `/ m²` puts 500 u at 55 u, before the near fade, so the
9x case pins both directions -- the dispatch's "55² still drawn" is not so: 55 < 100 is hidden);
`packages/viewer/test/worldLod.test.ts` "buildWorld's frame takes the render view: ..." (a three-copy spot, 500 u at
1x / 3x / 9x and no view).

## 2. The view range (PF-29, `VIEW_RANGE_EXTRA_READING`)

The view-state machine `FUN_001f0750` (D:L52842) first calls `FUN_001f1470(0, 0)` on any change (D:L52939), then
`FUN_001f1470(200, 1)` in state 3 (D:L53049; `DAT_003dc368` = 200.0 in `.data`), `FUN_001f1470(DAT_0043666c, 1)` in
state 4 (D:L53075) and `FUN_001f1470(DAT_00436670, 1)` in states 5-12 (D:L53159). The two `.bss` floats are
`CMission`'s members `+0x18c` / `+0x190` (the object at 0x4364e0, constructed by `FUN_00400160` D:L328188-328189),
200.0 and 300.0 by its constructor `FUN_002adbc0` (D:L152890-152891); the optional mission keys `SEEFARTHER_BINOCS`
/ `SEEFARTHER_WEAPZOOM` may override them (`FUN_002aab20` D:L151383-151384), an absent key leaving the value as it
was (`FUN_0032ea80` D:L229942-229973), and neither is on any of the 34 retail mission scripts (reconciliation C13,
chunks 07 and 14, reviewed PASS). Read live they are 200.0 and 300.0 in the saved spawn dump (chunk 07). The night
vision's 200 is the `.data` constant, which no key reaches -- hence a reading. Was: "Both are `.bss` with no writer
found (`bss_writers.out`); read live they are 200.0 and 300.0 in four RDRAM dumps (`rdram_viewrange.out`), set by the
title screen already (V4 #31) -- hence a reading." `FUN_001f1470` (D:L53202-53255) with 1 saves and adds the amount to the
fog far (`cam+0x128`), the far clip (`+0xf0` / `+0x2ec`) and the mid (`+0xec` via `FUN_00291180`), then rebuilds the
fog (`FUN_00294070`); with 0 it restores them and the fog colour. The near is untouched: the ramp lengthens.

**As built.** `viewRangeExtra(state)` (`zoom.ts`): 200 in 3 and 4, 300 in 5-12, else 0; `Zoom.renderView()` carries it
beside the magnification. The extra follows the state at once (the game calls `FUN_001f1470` on the change), the
magnification runs. In `WorldView.frame`:

- `extendFog(scene, extra)` (`fog.ts`) recomputes the fog's uniforms from the settings the last `applyFog` stored, with
  `far + extra`, the near and the colour (with any lens or wash on it) unchanged; at 0 it puts the base back. It is a
  no-op while the extra holds, so `frame` calls it every frame. `applyFog` (a slider, the night-vision lens's colour, a
  map load) stores a new base and puts it on unextended; the next frame extends it again while the view asks -- a
  map load's fog is never read as an extension. The scene is the root the world's group hangs under.
- `extendFar(camera, extra)` sets the camera's far to its base plus the extra and updates the projection; the base is
  the far the camera had without this extension -- a far set from outside since (`FlyCamera.setClipPlanes` at a map
  load) is taken as the new base (this goes further than the dispatch's "re-read when the extra is 0": a load while
  scoped is also right).
- A scope left on a death: `Zoom.reset` puts the state at 0, the next frame's extra is 0, the fog and the far restored.
- **The mid (`+0xec`)** has no plane in the port's camera still; since AD-1 (§8) the record's MID is read
  (`CameraParams.mid`) and, with this extension, is the eye's aim ray's cap. Was: "**Not ported:** the mid (`+0xec`):
  the port's camera has no mid plane." The far clip the port extends is its own
  (`max(2000, 1.6 x the diagonal)`, 188 U6), not the record's 640/850: on a fogged map the fog, not the clip, is what
  shows the extra.

**Tests.** `packages/viewer/test/zoom.test.ts` "the view range's extension by state (FUN_001f0750 D:L52939, 53049,
53075, 53159; FUN_001f1470 D:L53202-53255): 0 in states 0-2, +200 in night vision and the binoculars, +300 in every
scope, 0 again on exit (VIEW_RANGE_EXTRA_READING); renderView carries the magnification on screen";
`packages/viewer/test/fog.test.ts` "the fog's far and the camera's far clip are pushed out by the view's extra and
restored: Frostfire 200..640 becomes 200..940 in a scope and 200..840 in the binoculars, the near unchanged, the colour
kept (FUN_001f1470: cam+0x128, +0xf0/+0x2ec, +0xec)" (the mutation 300 -> 200 fails it).

## 3. The last LOD copy (PF-29, `LOD_LAST_KEPT_RULING`)

`FUN_003b7b90` (`zdb_CVisual_DrawLOD`, D:L308899+) returns 0 at `range >= [4]` for every copy, with no exception for
the last (188 U5; V4 #34 CONFIRMED), and `FUN_003374c0` draws a banded visual only when it returns non-zero
(D:L235458-235469). The port's `lodIsLast` plateau (`lod.ts`, `e92b071c`) keeps the last copy at a spot drawn at every
range; research 188 U5 found its reason ("the edge sits inside the fog") half true -- Frostfire's 500 u edge is 32 %
unfogged, and at 9x (§1) the edge moves out to 1,500 u -- and left it to the owner.

**The owner, HUMAN_TASKS H92 (2026-10-04):** "the last LOD copy **kept as now** ("leaving render as is")". The plan's
row (PF.R4: "the last LOD copy culled in play") is overturned by that word; PF-29 builds no cull.
`LOD_LAST_KEPT_RULING = 'kept'` (`scene/src/lod.ts`) names the deviation; research 101 §3 B11 lists it as ruled; the
registry's `world.lod.last-kept` states the game's rule and the port's ruling, level `reading`.

**U4 (strict bounds, optional) not built.** `DrawLOD`'s strict `<=` / `>=` would change `lod.test.ts`'s "a band with no
fade is a hard edge, drawn at both of its ends" (360 and 260 / 500 drawn today); no `LOD_BOUNDS_READING` exists.

**Test.** `packages/viewer/test/worldLod.test.ts` (the same test as §1): the last copy at 20,000 u drawn at 1x and 9x.

## 4. The detail pass per visual (PF-30, `DETAIL_SWITCH_READING`)

*2026-10-24 (OT.R79's parity fix, the owner's question):* the pass is drawn under every picture, the PS2 picture's too --
its preset (`startupSettings.ts` `resolveVisuals`) had kept the 2026-10-03 plan's "Detail textures off", resting on
research 72's dead-on-disc belief that this section superseded; pinned by `test/startupSettings.test.ts` and
`test/detailPass.test.ts`.

`CPipe::RenderVisual` (`FUN_003374c0`) decides the detail pass once per visual, before it draws it
(D:L235405-235418): when the visual has a detail list (`visual[0x19]`, its count, non-zero) it transforms the three
floats at the visual's +0x0c (`puVar1 + 3`) as a point by the current matrix (`FUN_003085c0`: rows 0-2 times x, y, z
plus row 3), hands the point to `FUN_00290aa0` -- the scaled range squared of §1 -- into `DAT_004b4a98`, and sets
`DAT_004b4a88 = 1` when that is `<=` the first float of **any** of the list's 16-byte entries (`visual[0x18]`). The
pass's draw (`FUN_003b6e10`, D:L308360, the desktop's `detail`) runs only when the list exists, `DAT_004b4a88` is set
and `vparams` word 0 has bit 14 (0x4000, D:L308392). Nothing fades: a visual's pass is whole or absent (188 U2, STRONG;
V4 #33).

**The disc** (the scan of 2026-10-06, `SOCOM_DISC` RUN/MP*.ZDB, every `*_GEO.ZED`'s `vis` keys). 1,606 visuals carry a
`detail_buff`, 1,596 with bit 14; the ten without are 188 U2's (MP10 `mp10`, MP11 `upper`, MP52 `g1210`, `g1211`,
`g1210_1`, MP61 `post_tele`, `wc35`, `vis_bldg34a`, `g1897`, MP64 `jungletree01_roots`). A `detail_buff` is `cnt`
16-byte entries, each opening on its range squared, then `cnt` 12-byte tails (28 bytes an entry on all 1,606; 606
visuals hold more than one). Every range is one of its map's manifest `detail.range`s, and 1,511 visuals hold one
range across their entries; **95 do not** (MP53 39, MP61 28, MP62 28 -- MP61's 90,000 beside 20,000,000), and for
those the game draws every pass of the visual out to the largest, which the texture manifest's per-texture range
would not. `vparams` is 24 bytes on every visual read (177 on Frostfire), its +0x0c..+0x17 three floats in the node's
model space (`tankrailsupport`'s second visual: -3.03, -8.80, -0.80).

**As built.**

- **The centroid** (`DETAIL_CENTROID_READING` = `'vparams +0x0c'`, `scene/src/sceneGraph.ts`): `SceneNode.visualCentres`
  reads it per visual, `PlacedModel.centres` carries it, and `loadMap` puts a world chunk's through the placement's
  matrix as its vertices go (`transformPoint(p.rowMajor, ...)`, `placeMesh`'s); a prop's part keeps it in model space.
  A mesh with none (hand-built, or a record shorter than 24 bytes) stands in its positions' centre, the middle of its
  extent (`mergeMeshes`, `centreOf`).
- **The attribute** (`MeshData.centroids`, `mesh/src/meshData.ts`): xyz per vertex, every vertex of one visual
  carrying its visual's point; `mergeMeshes` keeps it when any part has it and synthesises a part's from its positions
  when it has none. `mergeWorld` (`viewer/src/loadMap.ts`, the merge cut out of `loadMap` unchanged otherwise) fills it
  for the parts of a **detail-bound** texture only. On the GPU it is `detailCentroid` (`centroid` is a GLSL ES 3.0
  keyword): per vertex on a world draw and on a prop's single or LOD mesh (model space, the mesh's matrix placing it),
  per instance on an instanced prop (each placement's centroid in the group's frame, refreshed whenever a placement is
  put: a door's swing, a hidden member). `modelViewMatrix` takes either to the eye.
- **The switch** (`DETAIL_SWITCH_READING` = `'whole visual, no fade'`, `viewer/src/materialSpec.ts` `detailSwitch`, its
  CPU twin; `world.ts` `detailColor`): the pass's alpha times `step(|centroid_eye|² x rangeSqScale <= range)`, made per
  vertex into a varying. `rangeSqScale` is PF-29's uniform, now `1 / view.magnification` (it was `1 / sqrt(m)` on the
  plain range): the same range² / m as the LOD (§1). The game decides once per visual per frame, the shader per vertex
  on a per-visual point: the same answer, and no ring -- a visual split across two draws by the merge's cuts switches as
  one, its centroid being the same in both.
- **The range** (`DETAIL_RANGE_SOURCE_READING` = `"the visual's detail_buff, its largest entry"`): the dispatch's
  reading was the texture manifest's `detail.range` with a scan owed; the scan above found the 95, so the port reads
  the visual's own entries (`SceneNode.visualDetailRanges`, the largest first float, `LoadedMesh.detailRange`), uniform
  per draw through a per-object uniform (`onObjectUpdate`); a draw with none (hand-built) takes its texture's record
  (`DetailSpec.range`, which replaces the retired `fade`).
- **Bit 14** (`DETAIL_BIT14_READING` = `'vparams word 0 bit 14'`, `VISUAL_FLAG_DETAIL`, `visualHasDetail`): read per
  visual into `PlacedModel.detail` and `LoadedMesh.detailOn` (false when clear); `addDetail` hangs no pass on such a
  draw. `mergeWorld` splits a detail-bound texture's run where its visuals disagree on the bit or on their range, so a
  draw is gated whole, as a blended chunk splits a run; a texture with no detail pass is not split. Cost in draws: MP61
  420 (416 unsplit), MP62 335 (323), MP52 336 (335), MP53 and MP64 none.
- **Retired:** the W1.6 per-fragment fade (`detailWeight`, `DetailSpec.fade`: a linear fade to `sqrt(range)` by the
  fragment's distance, "the brief's reading" for a world merged with no centroid left), research 101 §5.

**What the owner would see.** Close up nothing changes: the grain is whole inside the range, as it was near the eye.
At the range's edge the grain no longer thins out over the last stretch: on Frostfire's oil-grime floor, Desert
Glory's ground, Crossroads' cobbles and walls and every other map's detail-bearing surfaces, a visual's grain now holds
full strength until its centre passes the range (500 u on Frostfire, 450 u on Desert Glory, 320 u on Shadow Falls) and
then goes in one step, the
whole visual together (a large ground visual can switch while its near edge is close to the camera, as on the
console). In the binoculars and the scopes (once PF-29's wiring passes the view) the grain reaches m times the range
squared, 3x as far at 9x. Shadow Falls' `jungletree01_roots` (four placements) and the nine other bit-less visuals lose
the grain they drew until now, and on MP53, MP61 and MP62 a visual with two detail textures draws both out to the
larger range.

**Memory.** 12 bytes a vertex on the detail-bound draws only (per instance on an instanced prop): Frostfire 13.4 KiB
(1,096 of 15,071 world vertices, 44 prop vertices), Desert Glory 23.4 KiB, Crossroads 160.3 KiB, Shadow Falls 142.7 KiB,
MP61 188.9 KiB, MP52 118.4 KiB, MP73 209.2 KiB (17,622 of 28,384) -- held once on the CPU and once on the GPU.

**Tests.** `packages/mesh/test/merge.test.ts` "mergeMeshes carries each part's centroid as a per-vertex attribute:
every vertex of one part shares it, two parts differ, and a part without one gets its positions' centre";
`packages/viewer/test/detailPass.test.ts` "the detail pass is on for a whole visual whose centroid's scaled range² <=
the record's range and off beyond it: 449 u on, 451 u off at range 202,500 (FUN_003374c0 D:L235405-235418); no fade
(DETAIL_SWITCH_READING)" (450 u on: the `<` mutation fails it), "a visual whose vparams word 0 lacks bit 14 (0x4000)
draws no detail pass (FUN_003b6e10 D:L308392, DETAIL_BIT14_READING): a synthetic placement without the bit, and MP64's
jungletree01_roots when the disc is present" (ignoring the bit in `addDetail` or in `placeInstances` fails it), "the
detail gate scales with the view: at magnification 9 a visual 1,200 u out (1200²/9 = 400²) is inside range 202,500; at
1 it is outside", "a texture's run of visuals that disagree on bit 14 is split so each draw is gated whole (as a
blended chunk splits a run)", "the gate's range is the visual's own: the largest of its detail_buff entries, any entry
passing (FUN_003374c0 D:L235408-235415, DETAIL_RANGE_SOURCE_READING); its centroid is vparams +0x0c
(DETAIL_CENTROID_READING)"; the Frostfire fixture test there checks the oil-grime draws' centroids. The GPU graph is
not run headless: the tests read the attribute and the gate's two uniforms off the built world and decide with the CPU
twin.

## 5. The spectator's pad, and `Scenic_Views`' layout

### 5.1 The answers

- **All on release.** The spectator camera (`FUN_00295260` D:L139463-139590) tests pad bytes +7, +10, +5 and +6
  `== 3`, the just-released state; the dead player's cycle latch (D:L451683-451694) tests +3 and +4 `== 3`
  (research 179 §9.6; `SPECTATOR_RELEASE_READING`). The page's keys act on `keyup`.
- **The controls.** Right / Left (+3 / +4): the next / previous followed player. Up / Down (+5 / +6): the next /
  previous scenic view, entering scenic mode. X (+10): ~~follow <-> the remembered free or scenic mode~~ scenic or follow
  -> free -> back, free the hub (research 244 §3, 2026-10-08). Triangle (+7):
  jump to the visible player nearest the view's centre (`FUN_00294f40`). X, Up and Down are one `else if` chain (one a
  frame); Triangle and the cycle are tested apart. The slots are the raw pad's, not the controller config's.
- **Who cycles whom.** A spectator every living non-spectator (`FUN_00547170` / `FUN_00546fa0` argument 0); a dead
  player the living teammates, escortees and hostages excluded (argument 1, `+200 & 0x20000`, D:L412604-412609). The
  latch runs only with respawn off, for a ghost, or for a spectator (D:L451681-451682, `DEAD_CYCLE_RESPAWN_READING`).
  A dead player has no spectator camera: Up, Down, X and Triangle are a spectator's alone (`FUN_00295260` runs only
  when the local player is a spectator, `FUN_002c2fd0`, D:L139465).
- **Space is kept** beside ArrowRight as the PC convenience (the owner's word, the plan's row; PF.R51), and V, the
  page's old free-camera key, is X's alias. C (the walk's stance key, Triangle) is Triangle.
- **The scenic views read.** The MP2 fixture carries `Scenic_Views` (six views), and MP6 and MP72 too (nine, eleven):
  `SCENIC_VIEWS_READING` stands and no `SCENIC_VIEWS_PLACEHOLDER` was needed. A map without the field gets none, and
  Up / Down are no-ops there (X toggles free only).
- **`SPECTATOR_PAD_PLACEHOLDER` retired** (the slots read, research 179 §9.6); its name stays in `netPage.ts`'s comments
  until wave 4's delegation (§5.7) removes them.

### 5.2 The spectator camera, `FUN_00295260` (D:L139448-139590)

> Superseded by research 244 §3 (2026-10-08): the spectator camera's state byte is the camera's +0xf4 (`FUN_0029b0c0` D:L142660) and reads **0 free** (`FUN_002964f0` D:L140442), **1 follow** (`FUN_00297410` D:L140957-140960), **2 scenic**; `FUN_002956e0` sets 0 for the local object and 1 for another actor (D:L139698-139704); X goes scenic -> free -> scenic and follow -> free -> follow, free the hub (`FUN_00295260` D:L139480-139530). The labels "0 follow, 1 free" and the table's "(the free camera)" here are kept as the record; the byte values in the table were right; the code is `packages/viewer/src/spectatorView.ts` (PT-19b). A reading (the decompilation, not measured running). `FUN_002956e0` also writes byte 1 from the mode it leaves (0 -> 0, 1 -> 1, 2 kept; D:L139680-139686), and `SPECTATOR_START_READING` is re-read from the camera's initialiser (244 §3.1).

Its state (`param_1`): byte 0 the mode (0 follow, 1 free, 2 scenic), byte 1 the remembered mode, `+0x1c` the scenic
index, `+4` the scenic angles, `+0x18` the followed actor. Gated by `DAT_0045a0c1` (online) and the local player a
spectator (`FUN_002c2fd0`, D:L139465), and by the controller's `+0x221` (an open menu, HUD mode 1) being 0 (D:L139475) -- the port's
`DEAD_CYCLE_WHILE_MENU_READING` gate, kept in the delegation.

| byte | test | effect | lines |
|---|---|---|---|
| +7 (Triangle) | `== 3` | `FUN_00294f40(param_1, param_2)`: jump to the visible player | D:L139476-139478 |
| +10 (X) | `== 3` | mode 2: remembered = 2, mode 0 (the zoom's magnification reset to 1); mode 1: the camera back on the local actor, remembered = 1, mode 0; mode 0: mode = remembered -- 2: `FUN_002ab260(views, index, 0, ...)` (the view at the index, at least 0), 1: `FUN_002956e0` (the free camera) | D:L139480-139530 |
| else +5 (Up) | `== 3` | `index = FUN_002ab260(views, index, 1, ...)`; when `index >= 0`: mode 2 | D:L139531-139558 (the index test D:L139535) |
| else +6 (Down) | `== 3` | the same with step -1 | D:L139559-139585 (D:L139563) |

`FUN_002ab260` (D:L151453-151489) over the view list (count at `+4`): with no views it returns the index unchanged;
a positive step is `(index + step) mod count`; a step of 0 or less starts from `max(index, 0)`, adds the step, and
wraps below 0 by `+ count`. It then copies the record's three floats at `+0` to the position, the three at
`+0xc..+0x14` to the angles, and points at the name at `+0x18`. So from an index of -1 (none: the port's start,
`SPECTATOR_START_READING`) the first Up shows view 0 and the first Down the last; with no views the index stays -1 and
mode 2 is never entered.

### 5.3 The cycle (the latch D:L451670-451694, the actor D:L412728-412750, the walk D:L412590-412615)

The latch, in `FUN_00592560`'s online branch: when respawn is off (`DAT_00437ce8+0xdc` 0), or the player is a ghost
(`+0xd2`), or a spectator (`FUN_002c2fa0`), byte +3 `== 3` with the HUD mode not 1 sets `+0xfcd`, byte +4 sets
`+0xfce`. The actor reads them with the menu flag clear: `+0xfcd` calls `FUN_00547170` (next), else `+0xfce`
`FUN_00546fa0` (previous) -- one a frame, next first -- with argument 0 when the local player is a spectator, else 1.
The walk (`FUN_00546fa0`, its slot index stepping down through `FUN_0029e470(0x4362e0, i)`) takes a character
(`+0x10 == 2`) that is not a spectator, alive (`+0xe1` bit 4) or the current one, and -- argument 1 only -- shares a
team bit with the local player (`+200 & +200`) and is no escortee or hostage (`+200 & 0x20000`). The order is the actor
list's (`SPECTATOR_CYCLE_ORDER_READING`): the port walks the seat ids in order, as `nextFollow` (`net/rules.ts`)
already did, and `previousFollow` is its twin.

### 5.4 Jump to the visible player, `FUN_00294f40` (D:L139348-139446) and `FUN_00308800` (D:L207111-207228)

Two points are put through the camera's matrix (`FUN_00308640(camera, pts, 2)`, D:L139391): the eye and a point `camera+0xf0`
along the view (`-+0xf0` on local z). Over the actor list, each character that is not a spectator gives
`d = FUN_00308800(its position +0x1c, eye, far point)` -- the distance to the **segment**: to the eye when the point is
behind it, to the far point past it, else to the line -- and its range `r = |position - eye|` (`FUN_00309200`). The
first is taken; a later one replaces the best when `(d - best_d) / best_d < -0.1`, or when that is under 0.1 and
`(r - best_r) / best_r < 0.1` with one of the two negative (the band D:L139415-139424). The best is then followed
(`FUN_002956e0(param_2, best, 0)`, D:L139442). `JUMP_TO_VISIBLE_READING` = 0.1, the band; the port reads `+0xf0` as the camera's
far distance (its value unread), the position as the body's feet, and takes the living only (the follow camera follows
the living; the decompiled walk has no alive test). *Re-filed 2026-10-14 (SPECTATOR-VIEW W5; research 248 F3, 314 §5.2):
the port now takes every body, dead or alive, as the walk does (D:L139398-139424); `JUMP_TO_VISIBLE_READING`'s doc and
research 101's row say so; the move off a corpse after is `FOLLOW_OFF_DEAD_READING` (research 314 §8).* *Re-filed
2026-10-16 (AD-8, research 314 §5.4): no longer -- `FOLLOW_OFF_DEAD_READING` is retired; the follow stays on a corpse
(the original keeps the dead bound actor and never rebinds a spectator's follow), a leaver is kept retired until
deleted, one a frame (`FOLLOW_RETIRED_BODY_PLACEHOLDER`, `FOLLOW_DELETE_QUEUE_PLACEHOLDER`,
`FOLLOW_AFTER_DELETE_PLACEHOLDER`, research 314 §8).*

### 5.5 `Scenic_Views`' layout (`READERM.ZAR/mission.rdr`)

Read through the repository's `parseRdr` (`tools`-free: `packages/viewer/src/mapMeta.ts` `scenicViewsOf`). The record
list sits beside `description`, `Valves` and `UiVars`; each record is `Pos (x y z) Rot (a b c) Desc (name)`, numbers as
decimal text (`SCENIC_VIEWS_READING`). MP2 (the fixture the test pins), in file order:

| # | Desc | Pos | Rot (written) |
|---|---|---|---|
| 0 | SEAL Start | 979, 236, 689 | -26, 53, 0 |
| 1 | Middle Passage | 749, 206, 647 | -16, 155, 0 |
| 2 | Eastern Overlook | 1199, 255, 1073 | -37, 54, 0 |
| 3 | Warehouse | 948, 161, 752 | -22, 142, 0 |
| 4 | Catwalks | 462, 199, 521 | -10, 177, 0 |
| 5 | Terrorist Start | 673, 210, 1256 | -15, 65, 0 |

MP6 has nine (Extraction Area ... Terrorist Start 2; research 190 §2 named six of their positions), MP72 eleven (SEAL
Base ... Terrorist Base), MP72's `Rot` first values written 0-360 (335-356) where MP2 and MP6 write -10 to -40: read as
the **pitch**, down negative, folded to (-180, 180] (337 is -23). The second is read as the **yaw** in the port's own
convention (the camera looks down its -z, yaw `atan2(-dx, -dz)`, `camera.ts` `lookFrom`): MP6's Hostage Room
(1621, 84, 1161) and Hostage Building (1535, 211, 1598) views, aimed by the port's convention at the hostage cell's
door (`actions.rdr` `cdoor1`, 1732.56, 50.5, 1218.42; research 190 §2), give 243 and 333 against the 238 and 328
written -- within 5 degrees; Hostage Cell's 27 against 53 is a view from the cell's corner, not at its door. The third
is 0 on every view read, taken as roll and unused by the pose. Owed: a capture of one scenic view's picture (the order
in which the engine applies `Rot`), with the spectator camera's other captures.

### 5.6 As built

- `packages/viewer/src/spectatorView.ts` (new): `SpectatorView` -- `mode` ('follow' | 'free' | 'scenic'),
  `remembered`, `target`, `scenic`, `benched`, `watching`; `key(e, blocked)` (keyup only, a repeat ignored), `pad(input,
  blocked)` (the last frame kept, `releasedSince`), `frame(eye?)`, `bench()`, `reset()`. The host gives the bodies, the
  seat (role, own id, team, the teams, the rules, the ghost), `spectate(pose | null)`, `leaveSelf()` (the walk to the
  fly camera, at the dead's first cycle), `views()` and `escortee(id)` (the port seats none: no wire field carries
  `+200 & 0x20000` yet). Pure helpers: `deadCycleRuns`, `previousFollow`, `scenicStep`, `segmentDistance`,
  `jumpToVisible`, `cameraEye` (a camera's eye off `matrixWorld`, undefined for a stand-in), `followPose` (24.906
  behind, 25.709 over, pitch -9.167: the third-person rest, research 83 and 88, moved from `netPage.ts`'s `followBody`).
- `packages/viewer/src/mapMeta.ts`: `ScenicView`, `SCENIC_VIEWS_READING`, `scenicViewsFromRdr`, `scenicViewsOf(bytes,
  toc)`; `packages/viewer/src/loadMap.ts`: `LoadedMap.scenicViews` (absent when none), read beside `missionName`.
- Tests: `packages/viewer/test/spectatorView.test.ts` (six), `packages/viewer/test/mapMeta.test.ts` (the MP2 layout,
  MP72's signed pitch). Nothing on the wire; protocol 10 unchanged. No three.js in the module.

### 5.7 The wiring owed (wave 4; the held area, PF.R53)

**Landed in wave 4 (2026-10-06, `agent/wave4c`)**: the patch below applied as it stands, the three lines in each of
`main.ts` and `matchMount.ts`, `netRules.test.ts`'s keyups and the drafted `netPageGame` pin; with them the review's gate
(the risk below): `NetPage.spectatorCamera()` (a spectator, or a benched player) and both frame loops' lift
`fly.setLift((input.jump ? 1 : 0) - (input.crouch || (input.stance && !net?.spectatorCamera()) ? 1 : 0))`, so Triangle
is the spectator's alone -- `matchMount.test.ts` pins every pair. Before them the page kept Space / V on keydown and the
module was tested alone. Every hunk below was
applied to a throwaway copy of `netPage.ts` on this branch (base 662fda10) and checked: the viewer typechecks, and
`netRules.test.ts`, `netPageGame.test.ts`, `netPageRound.test.ts` and `netPageConnect.test.ts` pass against it (with
`netRules.test.ts`'s three Space dispatches turned to `keyup`, below), as does the wave-4 pin drafted at the end.

**`packages/viewer/src/netPage.ts`** (net -34 lines: the fields L426-437, `onKey`'s spectator lines L475-478, the
frame's L904-905 and the methods L916-958 out; one `SpectatorView`, a keyup handler, `spectatorPad` in; `unbench`,
`seatGhost`, L1055, `gate()` L782 and `prompt()` L793 read the view; the keyup listener added beside the keydown one
under the DEV gate and removed in `close()` and `release()`). The patch, exactly (`git apply` from the repository root):

```diff
diff --git a/socomlegacy/packages/viewer/src/netPage.ts b/socomlegacy/packages/viewer/src/netPage.ts
--- a/socomlegacy/packages/viewer/src/netPage.ts
+++ b/socomlegacy/packages/viewer/src/netPage.ts
@@ -5,7 +5,7 @@ import type { FireEvent, FireWeapon } from './fire';
 import { NetClient, type Simulate, type WebSocketLike } from './net/client';
 import { isPinnedSocket, matchSocketUrl, type PinnedSocketUrl } from './connectHost';
 import type { LoadoutRefusal, MatchStats, Rules, ScoreRow, ServerEvent, Team } from './net/protocol';
-import { countdownLine, eliminationLines, MAX_ROUNDS, nextFollow } from './net/rules';
+import { countdownLine, eliminationLines, MAX_ROUNDS } from './net/rules';
 import { deathPose, flinchPose, type RemotePlayers } from './remotePlayers';
 import { overall } from './net/damage';
 import { reloadInFlinch } from './net/flinchReload';
@@ -21,6 +21,9 @@ import type { ObjectiveLine, RoundCues } from './roundCues';
 import type { MatchGate } from './weaponExchange';
 import { keyboardSite } from './keyboardTesting';
 import type { WorldState } from './worldState';
+import type { Input } from './gamepad';
+import type { ScenicView } from './mapMeta';
+import { cameraEye, SpectatorView } from './spectatorView';
 
 /**
  * The page in a match (web sprint 3, M4-M8): the net client on the walk, the other players drawn (`./remotePlayers`),
@@ -49,6 +52,8 @@ export interface NetPageDeps {
   remoteGrenade(kind: string, from: [number, number, number], velocity: [number, number, number], owner?: number): void;
   /** The spectator's camera: the pose to stand the fly camera at (follow), or null to leave it free. */
   spectate(pose: { x: number; y: number; z: number; yaw: number; pitch: number } | null): void;
+  /** PF-31: the map's scenic views (`./spectatorView` `scenicViews(map)`), read when the spectator steps to one. */
+  scenicViews?(): readonly ScenicView[];
   /** A round's effects and sound at a point (`Effects.onRound`, `GameAudio.onFire`). */
   roundEffects(e: Extract<FireEvent, { type: 'round' }>, muzzleOf: number): void;
   /**
@@ -423,18 +428,10 @@ export class NetPage {
    */
   private ghostSince: number | null = null;
   /**
-   * The spectator's view (research 91 section 12: `FUN_00295260`'s modes 0 follow a player, 1 free, 2 the map's scenic
-   * views). SPECTATOR_PAD_PLACEHOLDER: the game's buttons for them are not traced; here Space follows the next living
-   * player and V switches between following and the free (fly) camera. The scenic views are not drawn.
+   * PF-31 (ruling PF.R51; `./spectatorView`): the spectator's camera (follow, free, the map's scenic views) and the
+   * benched dead player's teammate cycle, on the pad's release and the keys' keyup; Space kept (the owner).
    */
-  private spectating: { follow: boolean; target: number | null } = { follow: true, target: null };
-  /**
-   * Classic (respawn off): the dead and the ghosts watch until the next round (`FUN_005979a0` L454484-454489), first
-   * their own body, then -- a press of the directional buttons, Space on the page (SPECTATOR_PAD_PLACEHOLDER) -- each
-   * living teammate in turn ("cycle through living teammates"). `watching` is the teammate followed, or null (self).
-   */
-  private benched = false;
-  private watching: number | null = null;
+  readonly spectator: SpectatorView;
   /** The room's rules and the game's round count (the welcome's; the page's choice until then). */
   private rules: Rules;
   private rounds = MAX_ROUNDS;
@@ -472,10 +469,12 @@ export class NetPage {
         return;
       }
     }
-    if (this.client.role === 'player' && this.benched && !e.repeat && e.code === 'Space') { this.nextTeammate(); e.preventDefault(); return; }
-    if (this.client.role !== 'spectator' || e.repeat) return;
-    if (e.code === 'Space') { this.nextTarget(); e.preventDefault(); }
-    else if (e.code === 'KeyV') { this.spectating.follow = !this.spectating.follow; if (!this.spectating.follow) this.deps.spectate(null); }
+  };
+  /** PF-31: the spectator's and the benched player's keys, on keyup (`./spectatorView`); the menu's keys alone while it is open. */
+  private readonly onSpectatorKey = (e: KeyboardEvent): void => {
+    const target = e.target;
+    if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
+    this.spectator.key(e, DEAD_CYCLE_WHILE_MENU_READING === 'blocked' && (this.deps.menuOpen?.() ?? false));
   };
   private unsubscribe: () => void;
   /**
@@ -503,6 +502,11 @@ export class NetPage {
   constructor(private readonly deps: NetPageDeps, private readonly url: string, private readonly map: string, private name: string, private readonly simulate?: Simulate, private readonly watch = false, rules: Rules = 'respawn') {
     // HARD-SEAT (the review's (4)): a socket that carries the ticket opens the pinned URL only (research 169 measure 7).
     if (deps.game && !isPinnedSocket(deps.game.pinned)) throw new TypeError('a game socket needs its pinned URL (pinnedMatchSocket)');
+    this.spectator = new SpectatorView({
+      bodies: () => this.client.bodies(), spectate: (pose) => this.deps.spectate(pose), views: () => this.deps.scenicViews?.() ?? [],
+      seat: () => ({ role: this.client.role, self: this.client.id, team: this.client.team, teams: this.teams, rules: this.rules, ghost: this.ghostSince !== null }),
+      leaveSelf: () => { this.deps.walk.setMode('fly'); },
+    });
     this.rules = rules;
     this.asked = rules;
     const adopt = deps.game?.adopt;
@@ -512,6 +516,7 @@ export class NetPage {
     if (import.meta.env.DEV) {                                       // OT.R29: the keys a development build's only
       keyboardSite('s2u-kb-net-page');
       globalThis.addEventListener?.('keydown', this.onKey);
+      globalThis.addEventListener?.('keyup', this.onSpectatorKey);
     }
     if (!deps.solo) globalThis.addEventListener?.('pagehide', this.onPageHide);
   }
@@ -666,6 +671,7 @@ export class NetPage {
     this.deps.hud.setRoundScreen(null);
     this.deps.hud.setScoreRows(null, []);
     globalThis.removeEventListener?.('keydown', this.onKey);
+    globalThis.removeEventListener?.('keyup', this.onSpectatorKey);
     globalThis.removeEventListener?.('pagehide', this.onPageHide);
     this.unsubscribe();
     this.client.close();
@@ -686,6 +692,7 @@ export class NetPage {
     this.deps.hud.setRoundScreen(null);
     this.deps.hud.setScoreRows(null, []);
     globalThis.removeEventListener?.('keydown', this.onKey);
+    globalThis.removeEventListener?.('keyup', this.onSpectatorKey);
     globalThis.removeEventListener?.('pagehide', this.onPageHide);
     this.unsubscribe();
     this.deps.remote.clear();
@@ -779,7 +786,7 @@ export class NetPage {
     const player = this.client.role === 'player';
     return {
       inMatch: this.client.state === 'open', alive: player && !this.dead && this.ghostSince === null,
-      cameraOnSelf: this.watching === null, spectator: !player,
+      cameraOnSelf: this.spectator.watching === null, spectator: !player,
     };
   }
 
@@ -790,7 +797,7 @@ export class NetPage {
    * or the respawn rules (S1r, not wired: W4.R7).
    */
   prompt(): { ghost: boolean; sinceDeath: number } | null {
-    if (this.client.role !== 'player' || this.rules !== 'classic' || this.watching !== null) return null;
+    if (this.client.role !== 'player' || this.rules !== 'classic' || this.spectator.watching !== null) return null;
     const now = performance.now();
     if (this.ghostSince !== null) return { ghost: true, sinceDeath: (now - this.ghostSince) / 1000 };
     if (this.dead) return { ghost: false, sinceDeath: (now - this.dead.at) / 1000 };
@@ -901,8 +908,7 @@ export class NetPage {
     this.deps.walk.setTrigger(trigger);
     this.deps.remote.frame(dt, this.client.bodies(), camera);
     this.deps.roundAudio?.frame();                 // INT.R7: the round's cues that are due
-    if (this.client.role === 'spectator' && this.spectating.follow) this.follow();
-    if (this.benched && this.watching !== null) this.followTeammate();
+    this.spectator.frame(cameraEye(camera));       // PF-31: the follow, the scenic view, the watched teammate
     if (this.launchAt !== null) this.deps.hud.setTimer(Math.max(0, (this.launchAt - performance.now()) / 1000));
     else if (this.endsAt !== null) this.deps.hud.setTimer(Math.max(0, (this.endsAt - performance.now()) / 1000));
     // Research 91 section 4.1: "Press the %c button to respawn." from 5 s dead (the press counts once the body faded).
@@ -912,48 +918,9 @@ export class NetPage {
     }
   }
 
-  /** The next living player to follow, in id order, wrapping. */
-  private nextTarget(): void {
-    const alive = this.client.bodies().filter((b) => (b.flags & 64) !== 0).map((b) => b.id).sort((a, b) => a - b);
-    if (!alive.length) { this.spectating.target = null; return; }
-    const at = this.spectating.target === null ? -1 : alive.indexOf(this.spectating.target);
-    this.spectating.target = alive[(at + 1) % alive.length]!;
-    this.spectating.follow = true;
-  }
-
-  /**
-   * The follow camera: behind the followed body and over it at the game's third-person distances at rest
-   * (`./playerCamera`: 24.906 behind, 25.709 up at the spawn pitch), looking where it looks.
-   */
-  private follow(): void {
-    let body = this.client.bodies().find((b) => b.id === this.spectating.target && (b.flags & 64) !== 0);
-    if (!body) { this.nextTarget(); body = this.client.bodies().find((b) => b.id === this.spectating.target); }
-    if (!body) return;
-    this.followBody(body);
-  }
-
-  private followBody(body: { feet: readonly number[]; yaw: number }): void {
-    const y = (body.yaw * Math.PI) / 180;
-    const back = 24.906, up = 25.709;
-    this.deps.spectate({ x: body.feet[0]! + Math.sin(y) * back, y: body.feet[1]! + up, z: body.feet[2]! + Math.cos(y) * back, yaw: body.yaw, pitch: -9.167 });
-  }
-
-  /** Classic's dead: the next living teammate to follow (`./net/rules` `nextFollow`), the fly camera on it. */
-  private nextTeammate(): void {
-    const mine = this.client.team;
-    const living = this.client.bodies().filter((b) => (b.flags & 64) !== 0 && b.id !== this.client.id && this.teams.get(b.id) === mine).map((b) => b.id);
-    const next = nextFollow(this.watching, living);
-    if (next === null) return;
-    if (this.watching === null) this.deps.walk.setMode('fly');
-    this.watching = next;
-    this.followTeammate();
-  }
-
-  /** The followed teammate at the follow camera's distances; on to the next when it has died. */
-  private followTeammate(): void {
-    const body = this.client.bodies().find((b) => b.id === this.watching && (b.flags & 64) !== 0);
-    if (!body) { this.nextTeammate(); return; }
-    this.followBody(body);
+  /** PF-31: the pad, once a frame (`./main`'s and `./matchMount`'s pad frames): the spectator's and the benched player's controls on release. */
+  spectatorPad(input: Input): void {
+    this.spectator.pad(input, DEAD_CYCLE_WHILE_MENU_READING === 'blocked' && (this.deps.menuOpen?.() ?? false));
   }
 
   /** The game's round start on the HUD, for this round of this room. */
@@ -973,13 +940,12 @@ export class NetPage {
 
   /** Back in play (a spawn, a new round): the bench and its camera left. */
   private unbench(): void {
-    this.benched = false;
-    this.watching = null;
+    this.spectator.reset();
   }
 
   /** Seated as a ghost (a classic round in play): benched until the next round, WEAPON EXCHANGE's ghost prompt up. */
   private seatGhost(): void {
-    this.benched = true;
+    this.spectator.bench();
     this.ghostSince = performance.now();
   }
 
@@ -1052,7 +1018,7 @@ export class NetPage {
           const at = performance.now(), clip = ev.clip;
           this.dead = { at, prompted: false };
           // Classic: benched; the dead's lines are WEAPON EXCHANGE's prompt (S1, `promptLines`), drawn by the overlay.
-          if (this.rules === 'classic') this.benched = true;
+          if (this.rules === 'classic') this.spectator.bench();
           hud.setHealth(0);
           this.deps.died?.();                                       // FUN_00547af0: the zoom to 0, the camera at 1.0
           this.deps.walk.setDeathPose(clip ? () => deathPose(clip, (performance.now() - at) / 1000, this.deps.clips()) : null);
```

**`packages/viewer/src/main.ts`** (owed twice with `matchMount.ts`, PF.R53), three lines added:

- after L30 `import { chooseCharacterType, NetPage, type NetPageDeps } from './netPage';`:

  ```ts
  import { scenicViews } from './spectatorView';
  ```
- before L2339 `    const scoreboard = walking && (padMerged.scoreboard || scoreboardKeys.held());`:

  ```ts
      net?.spectatorPad(padMerged);                 // PF-31: the spectator's pad, on release (./spectatorView)
  ```
- after L2481 `    spectate: (pose) => { if (pose) fly.setPose(pose); },`:

  ```ts
      scenicViews: () => scenicViews(map),          // PF-31: mission.rdr's Scenic_Views
  ```

**`packages/viewer/src/matchMount.ts`** (the twin), three lines added:

- after L19 `import { NetPage, type NetPageDeps } from './netPage';`:

  ```ts
  import { scenicViews } from './spectatorView';
  ```
- after L311 `      spectate: (pose) => { if (pose) fly.setPose(pose); },`:

  ```ts
        scenicViews: () => scenicViews(map ?? {}),   // PF-31: ./main's twin (the map may load after the page)
  ```
- before L399 `      const scoreboard = walking && (padMerged.scoreboard || scoreboardKeys.held());   // research 87 §12: SELECT held`:

  ```ts
        net?.spectatorPad(padMerged);               // PF-31: ./main's twin
  ```

**`packages/viewer/test/netRules.test.ts`** L136, L152, L155: `new KeyboardEvent('keydown', { code: 'Space' })` ->
`new KeyboardEvent('keyup', { code: 'Space' })` (the keys act on keyup now; the tests' claims are unchanged).

**`packages/viewer/test/matchMount.test.ts`**: the mirror pin for the two `spectatorPad` lines and the two
`scenicViews` deps (as the PF-17/PF-18/PF-19 pins do).

**`packages/viewer/test/netPageGame.test.ts`**, the wave-4 pin (drafted and run green against the wired copy; it uses
the file's own `page()` and `welcome`):

```ts
describe('PF-31: the spectator wiring (wave 4)', () => {
  it("NetPage hands its spectator keys and pad to SpectatorView and places the camera from its pose; a player who is not benched is untouched", () => {
    const poses: unknown[] = [];
    const views = [{ name: 'SEAL Start', at: [979, 236, 689] as [number, number, number], pitch: -26, yaw: 53, roll: 0 }];
    const bodies = [{ id: 2, flags: 64, feet: [100, 0, 0], yaw: 0 }, { id: 3, flags: 64, feet: [300, 0, 0], yaw: 0 }];
    const p = page(false, { spectate: (pose) => { poses.push(pose); }, scenicViews: () => views });
    p.server({ ...welcome, role: 'spectator', team: null } as ServerEvent);
    p.net.client.bodies = (() => bodies) as never;
    const idle = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, jump: false, crouch: false, stance: false, boost: false, fire: false, zoom: false, zoomOut: false, fireMode: false, action: false, leanLeft: false, leanRight: false, mode: false, swap1: false, swap2: false, inventory: false, scoreboard: false, reload: false };
    p.net.spectatorPad(idle);
    p.net.spectatorPad({ ...idle, zoom: true });
    expect(p.net.spectator.mode).toBe('follow');
    p.net.spectatorPad(idle);                                   // Up released: the scenic view
    expect(poses.at(-1)).toEqual({ x: 979, y: 236, z: 689, yaw: 53, pitch: -26 });
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
    expect(p.net.spectator.mode).toBe('scenic');
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' }));
    p.run(20);
    expect([p.net.spectator.mode, p.net.spectator.target]).toEqual(['follow', 2]);
    expect(poses.at(-1)).toMatchObject({ x: 100, y: 25.709, z: 24.906, pitch: -9.167 });
    p.net.close();
    // A player alive in the round: no key or pad edge moves the camera.
    const shots: unknown[] = [];
    const q = page(false, { spectate: (pose) => { shots.push(pose); } });
    q.server(welcome);
    q.net.client.bodies = (() => bodies) as never;
    q.net.spectatorPad({ ...idle, leanRight: true });
    q.net.spectatorPad(idle);
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    q.run(20);
    expect([shots, q.net.spectator.watching, q.net.spectator.benched]).toEqual([[], null, false]);
    q.net.close();
  });
});
```

The registry entries (`round.spectator.*`) cite `spectatorView.test.ts`; wave 4 adds this pin to
`round.spectator.pad-release`'s tests.

Risks for wave 4: in the fly camera Triangle is also the fly camera's "down" and the d-pad's Right / Left nothing
(`matchMount.ts` L362 and `main.ts` L1889, `fly.setLift`), so a spectator's Triangle moves the free camera down while held -- the original's
free camera reads the sticks only; whether to mask Triangle in the free mode is the wave's call. The pad line sits in
the render block beside the scoreboard read, as the brief places it; a headless page (no renderer) forwards no pad.

### 5.8 Readings and placeholders (PF-31; folds into 232 §6)

| name | value | source | status |
|---|---|---|---|
| `SPECTATOR_RELEASE_READING` | `'release'` | `FUN_00295260` D:L139463-139590 (bytes +5/+6/+7/+10 `== 3`), the latch D:L451683-451694 (+3/+4); 179 §9.6 | reading (`spectatorView.ts`); owed: capture |
| `SPECTATOR_CYCLE_ORDER_READING` | `'actor list'` (seat ids stand in) | `FUN_00546fa0` D:L412590-412615; 179 §9.6 | reading; owed: read (`FUN_00547170`'s walk) |
| `DEAD_CYCLE_RESPAWN_READING` | respawn off, a ghost or a spectator | D:L451681-451682 | reading |
| `JUMP_TO_VISIBLE_READING` | 0.1 (the band) | `FUN_00294f40` D:L139409-139424, `FUN_00308800` D:L207111 | reading; owed: read (`camera+0xf0`, `DAT_003f64c0`) |
| `SPECTATOR_START_READING` | remembered free, scenic index -1 | 179 §9.6 (the help line), `FUN_002ab260` D:L151453, D:L139520 | reading; owed: read (the state's initialiser) -- read 2026-10-08 (research 244 §3.1): the initialiser `FUN_00299150` D:L141664-141666 and the constructor `FUN_0029b5d0` D:L142860-142862 give remembered 0 (free) and index -1; ~~the mode entered (follow in the port) is open~~ the mode entered is free, by the online set-up's bind of the local object (D:L455701 -> `FUN_0029b3c0` D:L142768; 244 §3, the fix round), the entry pose `SPECTATOR_ENTRY_POSE_PLACEHOLDER` |
| `SCENIC_VIEWS_READING` | `Pos`, `Rot` (pitch yaw roll), `Desc` | the fixtures' `mission.rdr` (MP2, MP6, MP72), `FUN_002ab260` D:L151477-151485 | reading (`mapMeta.ts`); owed: capture (a view's picture) |
| `SPECTATOR_PAD_PLACEHOLDER` | -- | 179 §9.6 | retired 2026-10-06 (PF-31): the slots read; the name lives on in `netPage.ts`'s comments until wave 4 (§5.7) |

## 6. Readings and placeholders

| name | where | status |
|---|---|---|
| `LOD_SCALE_READING` | scene `lod.ts` | `'range² / magnification'`: `FUN_00290aa0` D:L137045, `+0x2c8 = +0x2cc / m` by `FUN_0029b2f0` D:L142705, `+0x2cc` 1.0 live (188 U1). Owed: review; a capture of Frostfire's railings at 500 u through the binoculars |
| `VIEW_RANGE_EXTRA_READING` | viewer `zoom.ts` | `{ nightvision: 200, binoculars: 200, scope: 300 }`: `FUN_001f0750` D:L53049 (`.data` 200.0), D:L53075 / D:L53159 (`.bss`: `CMission` +0x18c / +0x190, 200.0 / 300.0 by its constructor `FUN_002adbc0` D:L152890-152891; the optional `SEEFARTHER_BINOCS` / `SEEFARTHER_WEAPZOOM` keys, `FUN_002aab20` D:L151383-151384, absent on all 34 retail scripts; §2). Owed: a capture of the cells and `cam+0xec` across the view's states (§8.5). Was: "Owed: the `.bss` floats' writer" |
| `ALPHA_PASS_SCALE_READING` | -- | *note only*: the alpha pass's sort key is the scaled range² (`FUN_00290aa0`); one positive factor leaves the order as it is, so the port sorts by the plain range (`world.ts` `reorderAlphaPass`'s comment). No constant, no test |
| `DETAIL_SWITCH_READING` | viewer `materialSpec.ts` (`world.ts`) | `'whole visual, no fade'`: the pass on while the centroid's scaled range² is `<=` the visual's range, off beyond (`FUN_003374c0` D:L235405-235418; 188 U2, V4 #33); the W1.6 fade retired (§4). Owed: a capture at the range's edge (Desert Glory's ground walked out past 450 u) |
| `DETAIL_BIT14_READING` | scene `sceneGraph.ts` (viewer `world.ts`) | `'vparams word 0 bit 14'` (`VISUAL_FLAG_DETAIL`): `FUN_003b6e10` D:L308392 (188 U2); ten disc visuals carry a `detail_buff` without it. Owed: a capture of MP64's `jungletree01_roots` close up |
| `DETAIL_CENTROID_READING` | scene `sceneGraph.ts` (viewer `loadMap.ts`, `world.ts`) | `'vparams +0x0c'`: the point `FUN_003374c0` passes `FUN_003085c0` then `FUN_00290aa0` (`puVar1 + 3`, D:L235406-235407), read off the disc's 24-byte `vparams`. Owed: review (that `CVisual::Read` keeps the disc's +0x0c in memory) |
| `DETAIL_RANGE_SOURCE_READING` | scene `sceneGraph.ts` (viewer `loadMap.ts`, `world.ts`) | `"the visual's detail_buff, its largest entry"`: any entry's range passes (`FUN_003374c0` D:L235408-235415, 16-byte entries); the scan of 2026-10-06 found 95 visuals (MP53, MP61, MP62) whose entries differ, so not the manifest's per-texture range. Owed: review (the in-memory entries' order and stride against `CVisual::Read`) |

`LOD_LAST_KEPT_RULING` (scene `lod.ts`) is a ruling, not a reading: §3, research 101 §3 B11.

## 7. The wiring owed

The held area (ruling PF.R53, dispatch §12): the world takes the view, and the page's two frame loops pass it since
wave 4 (2026-10-06, `agent/wave4c`; `matchMount.test.ts` pins the pair). Before them the view was `{ 1, 0 }` and nothing
changed on screen. One argument each:

- `packages/viewer/src/main.ts:2298` -- `view?.frame(fly.camera, dt);` becomes
  `view?.frame(fly.camera, dt, zoom.renderView());`
- `packages/viewer/src/matchMount.ts:395` -- `view?.frame(fly.camera, dt);` becomes
  `view?.frame(fly.camera, dt, firearm.zoom.renderView());`

## 8. The aim's reach (AD-1, web sprint 40; reconciliation C13)

Reading (the source chain independently reviewed in the reconciliation: chunk 08 line 18 for the MID and the formula,
chunk 14 for the constructor and the setters); the port's transcription **pending review**. Nothing here is proven.

### 8.1 The formula

`FUN_005aa6e0` (the eye's aim ray, called by the camera's `FUN_002998f0` D:L142026-142029 -- research 84 §19 names it
`FUN_00299ed0`, which begins at D:L142127):

- D:L464097-464105: the range is `FUN_003d27f0(FUN_005c3780(body + 0x5e0))` -- the held item's record `+0x3c` -- or 0
  with no item; one at or under 600.0 becomes 600.0. The record's `+0x3c` is written by the weapon parser as
  `Maximum_Range` x `DAT_003dfe10` (10.0), the key at 0x3fca40 (D:L322426-322430): world units, so the floor is 60 m.
  In a launcher's round mode `FUN_005c3780` takes the round's own record through `FUN_005c6600`'s redirect
  (D:L479603-479660; research 94 §C4), whose `Maximum_Range` is already x 10 in the port (`ThrowableRecord`).
- D:L464106-464109: the cap is `*(DAT_0045c380 + 0x128) + 0xec`, the active camera's mid; the reach is the smaller of the
  two -- the floor first, so a MID under 600 caps below it.
- D:L464110-464114: the segment is `(0, 0, -reach)` through the camera matrix.

### 8.2 The camera's `+0xec`

- The map's `cameras/camera` record (`zdb::tag_CAMERA_PARAMS`, 0x90 bytes) is copied whole to `cam+0xC0` by the loader
  `FUN_00318da0` (D:L217190-217197: the `cameras` / `camera` keys at 0x3f6cc8 / 0x3f6ba8), and again from its copy at
  `cam+0x1F0` by `FUN_002915f0` (D:L137526-137531): the record's `m_mid_plane` at 0x2C is `cam+0xEC` (near 0x28 ->
  `+0xE8`, far 0x30 -> `+0xF0`). The text's `mid_clip`.
- The 22 multiplayer maps (`packages/scene/test/cameraParamsDisc.test.ts`, the record against the map's own `mp<N>.rdr`
  text): the MID differs from the far on ten (MP5, MP9, MP52, MP53, MP61, MP62, MP64, MP72, MP73, MP83); MP5 and MP82 hold
  550, under the floor; MP6 and MP61 hold 600; no MID exceeds its far.
- The view states (§2): `FUN_001f1470(x, 1)` saves `+0xec` and writes it plus x through `FUN_00291180` (D:L53251-53252;
  `FUN_00291180` D:L137346-137355 also raises the far when the mid passes it, which the far's own +x keeps from
  happening); `FUN_001f1470(0, 0)`, first on every state change (D:L52939), writes the saved mid back (D:L53221-53227),
  and the saves are zeroed on the way to states 0 and 1 and in the default case (D:L52942-52944, D:L52969-52971,
  D:L53184-53186). So **across the view's state changes** the cap is the MID plus that state's extension: +200 in the
  night vision and the binoculars, +300 in a scope. Was: "... and by `FUN_001f1840` (D:L53321-53323) and the view's
  reset `FUN_001f1880` (D:L53349-53351). So at every state the cap is the MID plus that state's extension" -- AD-1's
  review (F4) found the paths below, which that sentence did not cover.
- Writers and paths outside the state changes, each **untraced** in a running original (§8.5):
  - the camera-parameter animation `FUN_00265f20` / `FUN_00266320` (D:L112550, D:L112586; D:L112673) writes `+0xec`
    through `FUN_00291180` too; whether a multiplayer map plays one is not traced;
  - the suspend / resume pair `FUN_001efa50` / `FUN_001efc30`: the suspend calls `FUN_001f1470(0, 0)` (D:L52451) -- the
    MID put back with the view state unchanged -- and the resume re-applies the last extension recorded while not
    suspended (`FUN_001f1470(DAT_00408ce0, DAT_00408cd8)`, D:L52527; the record D:L53215-53218). Called from D:L61992,
    D:L64827 and D:L78527, the resumes from D:L62200, D:L64743 and D:L78642;
  - the zeroing paths `FUN_001f1840` (D:L53321-53323; called from D:L50609, D:L50913) and the view's reset `FUN_001f1880`
    (D:L53349-53351; called from D:L57659, D:L57795) clear the saves without writing `+0xec` back, so a body taken
    while extended could leave the extension on the camera.

### 8.3 As built

- scene `cameraParams.ts`: `CameraParams.mid` (0x2C), a new public field.
- viewer `fire.ts`: `AIM_REACH_FLOOR` (600), `aimReach(range, cap)` (`min(max(range, 600), cap)`; `cap` null -- no camera
  known, a page without a map: the floored range, an adaptation), `cameraAimCap(mid, farExtra)` (the MID plus
  `Zoom.renderView().farExtra`, read at each cast so a state change moves it at once and its exit puts it back), and
  `FireSource.aimCap`. The eye's aim ray takes `eyeReach()` in the round's two legs, the eye's own round, the accuracy
  pip (`blockedMuzzle`) and a launched round's loft (the round mode's record); **the round's own flight keeps
  `Maximum_Range` x 10** (research 84 §13), so with nothing under the reticle the muzzle's leg leaves through the aim
  point at the reach and flies on to its range. A body on that leg past the reach (no aim point on it) still stops the
  page's drawn round, asked down the round's own line as `drawRound` asks (AD-1's review, F2) -- the page's own known
  stop at a body (BODY_STOP; the room's round goes on past a body at PERSON's 0.97 since PF-24: research 219's open gap,
  owed), as before AD-1. *(Was: "else the page marked the wall behind a body the room's round hits"; AD-1's re-review,
  N1: the room's round strikes that wall too.)*
- The reticle's pick (`matchFirearm.ts` `aimTarget`, NU-3b C4) is the same `FUN_005aa6e0` ray: it casts `Fire.eyeReach()`
  (public), the held item and the round mode as the shot takes them (AD-1's review, F1; was
  `ORDER_PICK_REACH_READING`'s 600).
- **Wired** in the page's one `Fire` source (`viewer/src/matchFirearm.ts`, the line cleared by the controller):
  `aimCap: () => cameraAimCap(d.map()?.camera?.mid, zoom.renderView().farExtra)` -- the loaded map's record and the
  zoom's state at each cast; both pages mount it (`matchMount.test.ts` pins the line once). The registry's
  `weapons.aim.reach` is a reading (was drift); research 84's `AIM_RAY_READING` is resolved.
- The room: it casts no eye ray of its own for a round (`ShotCone.check`'s `bound` takes the page's eye and aim with no
  length); its hostage order's pick (the same `FUN_005aa6e0` ray) keeps `ORDER_PICK_REACH_READING`'s floor, 600, page and
  room alike -- inside the order's 20-cell range a cap of 550 changes nothing, for the order alone; its doc
  (`net/hostageOrder.ts`) now names this section's MID (was: "unread: presumably the view's far distance").
- The HUD's range readout (`hud.ts` `RangeFinder`) casts its own 1,000-unit segment, not this ray (its doc corrected).

### 8.4 Tests

`packages/scene/test/cameraParams.test.ts` "AD-1: reads the mid plane, ..."; `packages/scene/test/cameraParamsDisc.test.ts`
(dev-disc, `SOCOM_DISC`: the 22 records against their text and the census; the ten differences and the two 550s);
`packages/viewer/test/fire.test.ts` "AD-1: the aim's reach" (the formula; the cap from the MID; a MID of 550 with a wall
past it; a range under 600; the view states into the night vision, the binoculars and a scope and out again; the round's
own flight; a round mode's record; F2's body past the cap on the round's line); `packages/viewer/test/matchFirearm.test.ts`
"AD-1: the aim's cap is the loaded map's camera MID ..." and "MP81's MID 2500: an enemy 800 down the ray ..." (F1, the
reticle's pick), and `matchMount.test.ts`'s pin of the line.

### 8.5 What would prove it

The original's dynamic endpoint trace (C13's remaining validation): the writers and values of `0x43666c` / `0x436670`
and `cam+0xec`, and `FUN_005aa6e0`'s segment end, across the view's transitions and their restoration and across a map
change, on MP5 or MP82 (550) and a map whose MID is not its far -- and across the untraced paths of §8.2: the camera
animation (`FUN_00265f20` / `FUN_00266320`), the suspend / resume pair (`FUN_001efa50` / `FUN_001efc30`) and the zeroing
paths (`FUN_001f1840`, `FUN_001f1880`; a body taken while extended). Not claimed.
