# 359 -- A body walked into a thin hull face stays on the side it came from

- Date: 2026-10-22. Simulation track. Branch `cursor/world-collision-thin-walls-1fbb`.
- Status: **reading, pending review**. The far-side push through a zero-thickness face is built and unit-tested,
  including three disc fixtures. No capture of the original running, so nothing here is proven. No new constant.
- Sources: [research 217](217-the-body-as-built.md) §2 (the body segments and `FUN_005483d0`); [research 281](281-mp6-scaffold.md)
  §4.3 (the hull query is one-sided; the edge test counts a point on an edge); `isWallSurface` in
  `packages/scene/src/collision.ts` (bit 1 set, bit 18 clear, `|n_y| < 0.7`, cited there as research 24 §2);
  [research 86](86-traversal.md) (the climb is the clip). `FUN_0054aa30` D:L414515-416190,
  `FUN_005483d0` D:L413380-413614, `FUN_002d2890` D:L174750.

## 0. The answers

The walk, the shots, the doors and the camera already collide with the disc's hull (`worldCollision` / `groundGrid`,
the ZDB `di` polygons and the map's grid), not the render mesh. The test room's model pack swaps a draw only
(`world.ts` around the `modelPackHook` comment; `modelPack.test.ts` keeps the collision positions). The draw world's
grid is built empty (`world.ts` `buildGrid` with three empty lists) and is not the walker's.

What clipped a body through a thin face was the slide, not a missing mesh. A face of no thickness has no interior.
Once the wish is already past it, the nearest point on the face lies between the centre and the side it came from, and
the radial push adds the radius further through. The crossing guard used a strict opposite-side test, so a start on
the plane and a path through a shared vertex were not crossings. `FUN_005483d0` D:L413533-413597 takes the velocity's
part into the contact away and does not place the body past the face. The port now tests the centre segment against
the face's finite edges, including the ends (research 281 §4.3, micro 336-361), and stands the body off on the side
it came from, at the class radius it already used.

A normal approach from outside a long face at run speed already stopped, because each sub-step is at most 1
(`MAX_SUBSTEP`) and the near-side push fires before the centre crosses. The new tests lock that path, the dive, a
half-second tick, a knock, a start on the plane, a start inside the radius, and a shared vertex.

## 1. What was compared

| Item | Source | Ours, before | Disc | After this change |
|---|---|---|---|---|
| Collision source, every map | `worldCollision` / `groundGrid` from the ZDB `di` | the disc hull for the walk, shots, doors and camera | the ZDB `di` and `grid_params` | match. The render mesh is not the collider |
| Test-room model pack | `world.ts` model-pack swap; `modelPack.test.ts` | a draw swap | n/a (an adaptation) | match. `?modmodels` does not replace the hull |
| Draw grid | `world.ts` `buildGrid` with empty lists | empty, draw order only | n/a | not the walker |
| Stand and crouch radius | `FUN_0054aa30` D:L415110-415133; moving centre D:L415354-415371 | disc radius 3.5 all around | class 3.5, but the moving centre reaches 9.43, still 5.39, the sides 4.9 | **open** -- LATER 283. Not retuned |
| Prone | D:L415119-415122, D:L415582-415621 | 3.12 across, 8.0 ahead, level | 3.12 across, about 11.2 to 12.32 of reach, the body pitched | **open** -- LATER 283 (`PRONE_PROBE_TILT_READING` `'root'` since PRONE-TILT-2 (3), research 217 §7.8: the line ahead tilts with the body, the 3.12 disc stays level) |
| Probe heights | `wallProbeHeights` | 6.5, and the idle head + 2 | the same lines; the posed head moves | partial. The idle is the reading (`WALL_HEAD_LINE_READING`) |
| Step height | `DAT_0044c26c`; research 217 §2.6 | 6.5 is the probe line, not a rise cap | the same | match. A face whose top only touches 6.5 is the kerb the walk climbs |
| Skin | `FUN_002d2890` micro ~1e-5 | none; a push only inside the radius | no skin width; the plane epsilon is 1e-5 | match in kind |
| Thin faces and vertices | `FUN_005483d0` D:L413533-413597 | a discrete wish, then a far-side radial push; a strict crossing missed a start on the plane and a vertex | one segment per game frame, the velocity stripped into the contact | **fixed** for that push and that miss. The segment fan stays LATER 283 |
| Tick | `GAME_FRAME_DT` = 525/15734; the port's `TICK` is 1/60 | 60 Hz sub-steps of at most 1; `MAX_TICKS` 30 drops a backlog | one solve per ~30 Hz frame | **open**, known (PF.R8). A large `dt` is covered inside each sub-step by the edge stand-off |
| One-sided faces | `FUN_002d2890` side 0x20; research 281 §4.3 | the slide is two-sided | the hull is hit from the front only (`FUN_00316e30` clears `+0x80` bit 1) | **open** on purpose -- LATER 343. Building it would open thousands of reachable backs |
| Bit 18 | movement mode | skipped (`isWallSurface`) | skipped | match |
| Slope against `|n_y|` | `FUN_005483d0` D:L413426-413457 drops a normal whose y is over 0.643, and a volumetric or liquid material | `isWallSurface` keeps `|n_y| < 0.7` | the 0.643 drop, one-sided on the normal | **open** -- LATER 344. Not changed |
| Doors and props | collision owners, `sweep` | in the grid when the node has `di` | the same | match |
| Grid seams | `cellRange`, ring 1 | a wall is linked to the cells it covers; the query is the 3x3 ring | the segment visits the cells it covers | match on the retail cells (MP2 160, MP6 180, MP72 170). A path through a vertex was the hole, and the edge test now includes it |
| A face ending under 6.5 | research 217 §2.2 | walked through | the original segment misses it | parity, pinned |
| Climb and ladder | `traversal.ts` `advance` | the feet come from the clip, with no slide | clip-driven (research 86) | **open**. No slide invented during the clip |
| Knock | `FUN_0057e770`; `KNOCK_SPEED_MAX` 100 | a velocity, then `fall` / `move`; collision stays on | collision during the knock | match on `main`. PR #441 is a draft and is not this change |
| Spawn grace | PR #441; LATER 14 | a look hold | no collision grace found | not a collision disable |
| Camera | `FUN_0029bf70`; `playerCamera.ts` | the segment probes stay on | on | match |
| Net nudge and snap | `walk.ts` `nudge`; `client.ts` `SNAP_DISTANCE` 24 | a teleport, no wall test | the original has no client prediction | **open** -- LATER 342 |
| Dev noclip | searched | none | n/a | none |
| MP7 Night Stalker | `RUN/MP7.ZDB` is not in `test-fixtures` | untested | needs the fixture | **open, needs disc reading** -- LATER 345 |

## 2. The stand-off

`Walker.slide` (`mover.ts`), before the radial push: the centre segment from the position the step started at to the
wish is tested against each probe band's edges (`segmentEdgeHit`). `minT` is `-1e-5`, so a start already on an edge
counts, and `u` includes both ends of the edge (research 281 §4.3, micro 336-361). The incoming side is the start's
signed distance to the wall normal. A start on the plane takes the side opposite the wish. When that start is already
the radius off -- a later pass of the same slide -- it is left where it is, so the second pass does not flip it.
Otherwise a finish closer than the radius on the incoming side is placed at the hit plus the radius along that side,
and the velocity into the wall is stripped (`FUN_005483d0` D:L413533-413597). The prone line ahead still runs after.

`crosses` uses the same edge test. It refuses a finish that leaves the side the centre started on, including a path
through a vertex. A start already on the face is the slide's to pull back, and is not itself a crossing.

The probe height stays strict (`minY < y && maxY > y`). A face whose top equals the 6.5 line is the kerb
`walk.test.ts` climbs. Making that bound inclusive stopped the kerb. A rail whose top sits between the 6.5 line and
the head line is walked through by the original and by the port (research 217 §2.2); a test pins that.

## 3. What stays open

- **LATER 283** owns the original segment fan and `FUN_005483d0`'s deep-contact revert. The stand-off stays the class
  radius 3.5 (prone 3.12 across and 8.0 ahead). Retuning it to 9.43 is not this change. The deep revert stuck MP72's
  emb01 step-down when it was tried (PR #408, closed).
- **LATER 342.** `WalkMode.nudge` adds the correction to the feet, and `reconcileFeet` snaps when the error exceeds
  `SNAP_DISTANCE` 24, with no wall test. A correction can still place a body past a face. Left alone: the corrections
  loop, and the original has no client prediction to copy.
- **LATER 343.** One-sided hull faces (research 281 §4.3). Not built.
- **LATER 344.** Replacing `|n_y| < 0.7` with the 0.643 drop changes which faces are walls on every map. Needs a
  re-read of which polygons the walk's batch is asked against (`FUN_002d2890` D:L174750, beside the drop at
  `FUN_005483d0` D:L413426-413457) before that filter moves.
- **LATER 345.** MP7. `RUN/MP7.ZDB` is absent. Needs disc reading: one tall `isWallSurface` face in `groundPolygons`
  of that archive, then the same walk. `FUN_0054aa30` D:L414515, `FUN_005483d0` D:L413380.
- **The climb.** `Traversal.advance` writes the feet from the clip and does not call `slide`. That matches a
  clip-driven move (research 86). A capture of a climb or a ladder exit into a thin face would settle whether the
  clip itself can finish inside geometry. No collision was added on that path.

## 4. The tests

`packages/viewer/test/thinWall.test.ts` (node). A synthetic crate: a run at `seal_run`, a dive, one tick of 0.5 s, a
knock at 80, a centre on the face, a centre 0.4 inside the radius, and the shared vertex of two triangles. Each
asserts the centre stays on the near side at the class radius. A face of height exactly 6.5 is climbed. A face ending
0.5 under that line is walked through.

Disc fixtures, skipped when the bytes are absent (`FIXTURES_ABSENT` is said, not counted as a pass):

| Map | Node | Stand | Face | Normal |
|---|---|---|---|---|
| MP6 Desert Glory | `worldmodel/garage` | (2089.00, 60.00, 1890.50) | (2097.00, 1890.50) | (-1, 0) |
| MP72 Crossroads | `worldmodel/wc39/di_all39` | (516.36, 122.79, 1692.00) | (516.36, 1700.00) | (0, -1) |
| MP2 Frostfire | `worldmodel/warehouse/wintdi` | (773.00, 100.00, 942.25) | (765.00, 942.25) | (1, 0) |
| MP7 Night Stalker | -- | -- | -- | needs disc reading (LATER 345) |

The MP72 stair pocket at (736.5, 42.5, 841.5) is a crack in the disc (`di_ext16_19`), not a clip, and is banned from
the finder. `doors.test.ts` and `walk.test.ts` (the 6.5 kerb) were run with this change.
