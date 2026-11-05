# 86 — Traversal: the ladder, the climb, the peek, the water

**Date:** 2026-09-28. **Scope:** the moves the walk lacked -- ladders, climbing onto and over obstacles (with the
climb icon and the jump-grab), the lean/peek, and wading -- read from the game and built into the viewer's walk
(`packages/viewer/src/traversal.ts`, `climb.ts`, `clipPath.ts`, `traversalPage.ts`, `actionIcon.ts`;
`packages/scene/src/ladder.ts`; the water in `packages/scene/src/probe.ts` / `collision.ts`).

**Sources.** "decomp NNN" is a line of `game/analysis/socom2_game.elf.decomp.c`; `FUN_`/`DAT_` are its Ghidra names.
The clips are the disc's `RUN/MOTION_P.ZAR`, the table `RUN/READERC.ZAR/motion.rdr` and `dynamics.rdr`, read with
the viewer's own readers (research 77) on 2026-09-28. reCOM (`research/recom`) names the states and the fields; it has
no ladder, climb or peek logic (declarations only). Markings: **[read]** off the decompilation, **[data]** measured on
the disc's files, **[derived]** computed from read values, **[viewer]** a choice of the viewer's, named.

## 0. The short of it

- **Everything is the polygon's `m_appflags`.** `DI_PARAMS`' three bits after `m_cameratype` (reCOM
  `zIntersect/zintersect.h:26`; surface word bits 20-22), tested as `((byte)poly[+0xA] & 0x7f) >> 4`
  [read: `FUN_002a9260` decomp 150357, `FUN_005b2620` 468399, `FUN_005b3ce0` 469133, `FUN_005b4b40` 469640,
  `FUN_005b0eb0`, `FUN_005b3890`]: **2 is a ladder, 1 and 3 climb by height, 4 is a crate (climbed only between 5 and
  32), 5 is always climbed over, 0 is never climbed.** Census of all 197,993 placed polygons of the 22 maps [data]:
  94 carry 2 (38 ladders on 14 maps, and nothing that is not a ladder), 4 is on crates, containers, pallets and low
  walls of 20 maps, 5 on MP1's and MP6's fences and boxes and three of MP81's polygons, and **1 and 3 occur on no
  multiplayer map**.
- **`dynamics.rdr`'s `low/med/high_climb_height` (13 / 21.5 / 26.5) and `min_stand_height` have no reader.** The
  loader `FUN_0059ba80` stores them at `0x44c250 +0x178..+0x188` (decomp 456970-456979) and nothing reads them; the
  climb's table is literal constants (`FUN_00580b70`, section 3.3). 13 and 21.5 are the heights the crate and medium
  clips were authored for (`refPt.y` + the root's 11.52).
- **`cam_peekl` / `cam_peekr` (side -/+70, aim (-/+30 0 0)) are dead data.** The peek camera is a literal shift of
  2.5 / 2.8 units (section 4.2).
- **The buttons** [read, `controller.rdr` Default]: **Cross is Action** (climb, the ladder's slide), **Square is Jump**,
  **the d-pad's left / right held is the peek**. The viewer's `PAD_LAYOUT` (W2.7) has Cross on jump and the lean on
  L2 / R2 -- both are the viewer's assumptions, and both differ from the game (section 7).

## 1. The clips

All from `motion.rdr` and `MOTION_P.ZAR` [data]. "Rise" and "ahead" are the skeleton root's travel from key 0 to the
last real key (the closing key is key 0 again, research 77 section 5); "seconds" is the loaded clip's `+0x10`
(section 1.1). Every climb and ladder clip carries `UseVelY` (the actor's vertical velocity is the root's) and `NoFire`.

| clip | keys | seconds | root y at key 0 | rise | ahead | `refPt` | NoInterrupt | callbacks |
|---|---|---|---|---|---|---|---|---|
| `seal_stand2ladder` | 27 | 0.9 | 11.78 | +3.52 | 6.73 | (-0.07, -11.78, -12.22) | (bare) | |
| `seal_climbladder` (loop) | 16 | 0.178 | 15.58 | +10.0 a cycle | 0 | | | `ladder_rung` at 0.01, 0.5 |
| `seal_climboffladder` | 37 | 1.4 | 17.02 | +18.91 (to 36.5 in the clip) | 8.38 | (0.265, 8.824, -5.565) | (bare) | |
| `seal_ladder2slide` | 13 | 0.5 | 20.39 | | | (0.265, 8.824, -5.565) | (bare) | |
| `seal_ladderslide` (loop) | 7 | 0.2 | 18.26 | | | same | (bare) | |
| `seal_ladderslide_land` | 37 | 1.3 | 11.44 | | -4.7 (back off) | same | 0.5 | |
| `seal_step_up` | 13 | 0.75 | 11.5 | +8.17 | 10.46 | (0, -3.48, -8) | 0.8 | |
| `seal_climbcrate` | 30 | 1.25 | 11.52 | +12.88 | 11.34 | (0, 1.48, -8.92) | 0.9 | `climb_up` at 0.1 |
| `seal_climb_medium` | 32 | 1.5 | 11.52 | +21.48 | 11.44 | (0, 9.98, -8.92) | 0.9 | `climb_up` at 0.1 |
| `seal_climb_over` | 19 | 1.0 | 10.96 | -0.96 | 16.28 | (0, -0.96, -10.28) | 0.8 | `climb_up` at 0.1 |
| `seal_stand2hang` | 25 | 1.4 | 11.52 | +6.81 | 3.49 | (0, 18.51, -5.65) | 0.85 | `jump_whoosh` at 0.5 |
| `seal_hang` (loop) | | 2.2 | 18.14 | | | | | |
| `seal_hang2climbup` | 63 | 2.8 | 18.14 | +22.59 | 5.24 | | 0.9 | `pull_up` at 0.01 |
| `seal_stand2llean` / `rlean` | 23 / 18 | 0.4 | 9.9 | | | | (bare) | |
| `seal_crouch2llean` / `rlean` | 15 / 21 | 0.5 | 5.1 | | | | (bare) | |
| `seal_prone2llean` / `rlean` | 12 / 10 | 0.8 / 0.65 | 2.2 | | | | (bare) | |

Also on hand, not played here: `seal_hang_jumpdown` (1.5 s), `seal_ledge2hang_bw`, `seal_hopdown_fw/bw` (0.4 s,
single-key poses), `seal_llean_rstep` / `seal_p_rlean_rstep` (a step while leaning), `seal_toss_llean/rlean`
(a grenade from a peek), `seal_dive2prone` (1.6 s, `dive_prone` at 0.45), `seal_slide` (6 s, the steep-ground slide
`FUN_0054edf0`, decomp 417196), the pistol's `seal_p_*` copies of all of the above.

### 1.1 `playback` and the loaded clip's length

`FUN_00287620` (decomp 131281-131320) [read]: a one-shot, or a loop whose `max_velocity` is negative, takes `playback`
as its length in seconds; a loop with a positive `max_velocity` (a locomotion cycle, the ladder's climb) takes its
own duration **divided by** `playback` -- `seal_climbladder`, 16 keys (0.533 s) over `playback` 3, loops in 0.178 s.
The same routine sets the clip's rate factor `+0x1c` to `max_velocity x 10 / 100` for a loop (0.135 for the ladder),
1 for a one-shot. A one-shot then runs from key 0 to its last key n - 1 in `playback x ((n - 1) / n)^2` seconds
(`FUN_0028c4f0`, the motion workstream's `oneShotSeconds`, research 80): `seal_climbcrate` 1.168 s. `ClipShape.seconds`
follows both.

### 1.2 `refPt` and the root's travel

`refPt.y` is the ledge's height less the root's start height: 13 - 11.52 = 1.48 (crate), 21.5 - 11.52 = 9.98
(medium) [derived; the fit is exact]. `refPt.z` is how far ahead of the root the edge is at the start: 8.92 for both
climbs. `FUN_005b1a10` (decomp 467859) records the clip's `refPt` (from clip `+0x4c`, `FUN_0058c2f0`), the target on
the edge and the facing; `FUN_005b2d20` (439017) then steers the actor until `R x refPt` lands on the target (section
3.5). At a clip's end `FUN_00589aa0` (446538) sets the actor on the ground under it (`FUN_003157d0`) and the root's y
to 11.4 (crate), 11.5 (medium), 10.73 (hang to climb), 10.45 (step up) [read]; gravity is suspended through these
clips (`FUN_005af930`, 466760).

**The viewer** (`clipPath.ts`) carries the feet from the move's start to its end in step with the clip's own running
rise and travel, and gives the animator the root's height over those feet that keeps the drawn body where the clip
puts it, stretched evenly over the move when the obstacle and the clip disagree (a 9-unit crate climbed with the
crate clip's 12.9), so the body ends on the top in the standing root with no pop [viewer].

## 2. Ladders

### 2.1 How a ladder is marked [read, data]

- `FUN_002a9260` (decomp ~150310-150357) builds the ladder list at load, at `DAT_00437ce4`: every node with at least
  one `di` polygon of `appflags` 2 gets a 0x28-byte entry (bbox min `+0`, max `+0xc`, node `+0x18`, occupancy `+0x1c`
  -- one SEAL a ladder --, owner `+0x20`, id `+0x24`). Lookups: `FUN_002a90f0` by node, `FUN_002a9210` by id; the
  SEAL's ladder id is `seal+0x1062` (0xFFFF none). `FUN_002a8f50` finds the nearest by the box's middle for the AI.
- Not by name: the ELF has no lowercase "ladder" string, and the nodes are `ladderdown`, `di_ladder`, `ladder35`,
  `ladders`, `climbme`, `climb01` ... The `LadderPressUp/Down`, `LadderUp/Down` and `GetLadderInfo` strings are the
  online rankings' UI, not climbing.
- **Each ladder is two quads in one vertical plane, both `m_ditype` 2 (side only):** the span, from the bottom floor to
  the top floor, and over it a short quad (9.4 to 10.0 tall; the game splits them at 15) wound the other way.
  The exporter repeats a prototype's `di` on its instancing node, so a ladder can come twice (MP61); `findLadders`
  merges the copies and sides each ladder: the climbing side is the one the top deck is not on (the probe's floor
  within 2.5 of the top, 6 either side of the plane).

### 2.2 Every ladder of the 22 maps [data, `findLadders` on the served tree, 2026-09-28]

The climbing side is the normal's; all 38 were sided by their deck.

| map | node | x | z | bottom | top | climbed from (n) |
|---|---|---|---|---|---|---|
| MP2 | `worldmodel/ladsnipe/ladderdown` | 547.5 | 854.4 | 100.0 | 160.0 | (0, 1) |
| MP2 | `worldmodel/lad1/ladderdown_1` | 783.3 | 363.7 | 99.9 | 155.2 | (0.87, -0.50) |
| MP2 | `worldmodel/lad2/ladderdown` | 496.7 | 596.3 | 99.9 | 155.2 | (-0.87, 0.50) |
| MP2 | `worldmodel/ldr/ladderdown` | 989.0 | 617.1 | 102.5 | 152.6 | (0, 1) |
| MP2 | `worldmodel/laddrilltower/ladddown` | 158.5 | 913.0 | 100.0 | 156.8 | (-1, 0) |
| MP6 | `worldmodel/g40` | 2065.8 | 1983.3 | 0.0 | 61.0 | (0, 1) |
| MP72 | `worldmodel/tower/di_ladder` | 1557.4 | 1330.7 | 119.3 | 219.3 | (0, 1) |
| MP10 | `worldmodel/myladder` | 676.4 | 1682.3 | 28.4 | 128.4 | (-1, 0) |
| MP10 | `worldmodel/myladder` | 2083.7 | 1691.2 | 30.8 | 90.8 | (-1, 0) |
| MP10 | `worldmodel/myladder_1` | 1352.2 | 1211.0 | 28.4 | 128.4 | (-1, 0) |
| MP5 | `worldmodel/myladder` | 990.6 | 1565.7 | 20.5 | 86.2 | (-1, 0) |
| MP53 | `worldmodel/ladder` | 3009.5 | 3246.5 | 80.8 | 165.8 | (0, -1) |
| MP61 | `worldmodel/ladder_astrike2/ladder` | 905.6 | 1891.1 | -3.7 | 48.8 | (0, 1) |
| MP61 | `worldmodel/ladder` | 937.4 | 986.0 | 39.4 | 91.9 | (0, -1) |
| MP61 | `worldmodel/ladder` | 1012.2 | 1770.2 | -3.7 | 48.8 | (1, 0) |
| MP61 | `worldmodel/ladder` | 434.2 | 1448.8 | -1.7 | 50.8 | (1, 0) |
| MP61 | `worldmodel/g1902/di_ladder01` | 813.0 | 1471.9 | -0.1 | 50.0 | (0, 1) |
| MP62 | `worldmodel/g253/climbme` | 1692.2 | 1901.9 | 200.4 | 275.7 | (1, 0) |
| MP62 | `worldmodel/g253/climbme` | 1349.0 | 1395.6 | 201.3 | 276.6 | (1, 0) |
| MP62 | `worldmodel/g253/climbme` | 2629.0 | 1394.0 | 205.3 | 280.6 | (1, 0) |
| MP62 | `worldmodel/g253/climbme` | 1854.8 | 1103.7 | 174.9 | 255.2 | (0, 1) |
| MP64 | `worldmodel/towerladder_di` | 563.7 | 2628.6 | 48.9 | 98.9 | (-0.42, 0.91) |
| MP64 | `worldmodel/towerladder_di` | 1810.5 | 1757.6 | 93.4 | 143.4 | (1, 0) |
| MP71 | `worldmodel/ladder01/di_ladder1` | 1952.1 | 1092.7 | 139.2 | 179.2 | (-1, 0) |
| MP71 | `worldmodel/ladder02/di_ladder1_1` | 2329.4 | 809.8 | 182.0 | 222.0 | (0, -1) |
| MP73 | `worldmodel/g5213/ladder35` | 810.0 | 1196.0 | 110.0 | 145.0 | (0, 1) |
| MP73 | `worldmodel/g5213_1/ladder42` | 782.0 | 923.1 | 66.0 | 108.0 | (1, 0) |
| MP73 | `worldmodel/ladder_tower/ladder50` | 1109.0 | 1020.2 | 60.0 | 130.0 | (-1, 0) |
| MP73 | `worldmodel/ladder_tower/ladder50` | 838.9 | 1459.5 | 60.0 | 130.0 | (-0.72, -0.69) |
| MP8 | `worldmodel/climb01` (19 wide) | 1330.0 | 616.2 | 91.7 | 149.2 | (0.59, -0.81) |
| MP8 | `worldmodel/climb05` (19 wide) | 868.6 | 1411.5 | 104.3 | 161.8 | (1, -0.04) |
| MP81 | `worldmodel/ladders` | 1288.2 | 1557.2 | 22.9 | 120.4 | (0.42, 0.91) |
| MP81 | `worldmodel/di_ladder` | 1183.9 | 984.4 | 5.0 | 57.5 | (0, -1) |
| MP81 | `worldmodel/di_ladder` | 1279.9 | 984.4 | 5.0 | 57.5 | (0, -1) |
| MP81 | `worldmodel/di_ladder` | 1380.9 | 984.4 | 5.0 | 57.5 | (0, -1) |
| MP81 | `worldmodel/di_ladder` | 1141.9 | 1069.7 | 120.0 | 247.5 | (0, 1) |
| MP81 | `worldmodel/di_ladder_2` | 1418.1 | 1069.7 | 120.0 | 247.5 | (0, 1) |
| MP82 | `.../ladder_hit/ladder_guardtower1=.../down` | 650.1 | 425.4 | -40.0 | 10.5 | (-1, 0) |
| MP82 | `.../ladder_static/ladder_guardtower1=.../down` | 2168.2 | 2098.6 | 47.6 | 98.0 | (1, 0) |

The tests climb MP2's first (the sniper ladder, 100 to 160) with the disc's clips, and pin all five of MP2's.

### 2.3 The state machine [read]

The state is `seal+0x174` == 5 (reCOM `SEAL_STATE::stateClimbLadder`, `zSeal/zseal.h:64`); "is on a ladder" is
`FUN_0054f6e0` (decomp 417318). Anim types (the name table at `0x661060`, `FUN_005e30f0`): 0x2c "Stand -> Ladder",
0x2d "Climb ladder", 0x2e "Climb off ladder"; by name (`FUN_005e1df0`, decomp 495177-495348): `DAT_003def40` "Ladder
-> slide", `DAT_003def50` "Ladderslide", `DAT_003def60` "Ladderslide land".

- **The contact, no button.** `FUN_005b4b40` (decomp 469562) runs each tick (not in states 4, 5) on the wall contact
  the move solver records at `seal+0x1090` (point, polygon `+0xc`, normal `+0x10`, node `+0x1c`): in front
  (`dot(normalize(seal - contact).xz, n) >= 0.3`) and facing it (`dot(seal matrix row 2, n) >= 0.02`, row 2 the back
  axis: facing into the quad); for the short quad `|dot|`, either facing. `FUN_005b3890` (decomp 469000) drops the
  contact past 24 across the ground (576 = 24^2), behind the plane, or with the feet more than 10 under the short
  quad's bottom. Walking into the ladder mounts it, through a reservation (`FUN_005b2620` -> `FUN_005b1130` /
  `FUN_005b1570`; online `FUN_002b9f60`), executed in `FUN_005b1c80`.
- **At the foot** (the tall quad, `seal+0x1331` = 0), `FUN_005b1c80` (decomp 468183) -> `FUN_0057f880`: "Climb ladder"
  at time 0 and "Stand -> Ladder" over it on layer 5; the SEAL aligned on the midpoint of the quad's horizontal edge
  (consecutive vertices within 0.01 in y), facing -normal, the root's target at feet + 15.6 (`0x4179999a`) -- the
  climb's key-0 root, 15.58 [data].
- **At the head** (the short quad, `0x1331` = 1), `FUN_0057f690`: "Climb off ladder" played backwards (the reverse
  flag: `FUN_0028c160` negates the rate and starts at the end), after "180" (decomp 468243) when facing away.
- **Climbing**, `FUN_00584240` (decomp 443742; the state-5 case of `FUN_005870e0`, 445180): the clip's rate is the
  stick's forward `seal+0x240` times clip `+0x1c` (0.135), times the loop's K (`FUN_0028d570`; `FUN_0028aa20` gives
  1.7778 on this `VerticalMotion` clip, its stride the root's y, 10 a cycle), backwards for a stick back; the rise is
  the root's. **At a full stick: 0.135 x 1.7778 x 16 keys / 0.178 s = 21.6 keys a second, 0.625 units a key: 13.5
  units a second** [corrected by research 206 section 2.4 (V6): a reading, pending review -- the rate an exact source
  read, the rise one interpretive step further (206's PROVEN and STRONG, under its line-9 mapping); the PINE read of
  `actor+0x20` on a climb is owed. This section's earlier 7.59 left K out]. A rung is 5 units (two `ladder_rung`
  callbacks a 10-unit cycle). No turning
  (`NoTurn`, `FUN_0054f7e0` decomp 417605), the lateral stick zeroed (`FUN_00550ef0`, 418157 and 418343).
- **The head.** At each cycle's end in state 5 (decomp 418140, `FUN_005b10b0`) with the stick at 0.03 or more
  (`DAT_003f3428`), `FUN_005b0eb0` casts a ray 11 along the facing from the root raised by the climb-off's offset less
  1; with no `appflags` 2 polygon hit, "Climb off ladder" plays forward and at its end (`FUN_00588bc0`, decomp 446544)
  the SEAL is set on the top and the ladder released (`FUN_0059d750`). A climb off that would collide (radius 15 or
  19.1, `FUN_0054f7e0`) is reversed back onto the ladder (`FUN_0057f5b0`) -- not modelled. The viewer reads "the
  offset" as the climb-off's rise (18.91): the ray at root + 17.91 clears the short quad's top exactly when the hips
  stand 7.9 under the deck, which puts them 11.0 over it at the clip's end -- the standing root [derived].
- **The foot.** A stick back with the feet under the ground + 1.0 plays "Stand -> Ladder" backwards.
- **The slide.** The action button's context action 0x10 (bit `1 << 16` of `seal+0xed4`), labelled "LADDER SLIDE"
  (0x3e4de8) beside ACTION and CLIMB (`FUN_0021ded0`, decomp 73601): `FUN_00592d50` (452108) -> `FUN_0057f530` (only
  while "Climb ladder" plays) -> `FUN_0057f3e0`: "Ladder -> slide" then "Ladderslide", falling at **gravity x 0.8**
  (`FUN_0059b440`, decomp 456492), the root held at 11.44 (`FUN_0059b870`), "Ladderslide land" on the ground
  (`FUN_005af930` 466864, `FUN_0057f310`). A slide from the head (holding input slot 0 in the reversed climb-off's last
  0.2, `FUN_00582540` decomp 442920) is not modelled.
- **The camera** has no ladder mode; `FUN_0029a950` only skips its upward test on a ladder (decomp 142503).
- **Network codes** (`FUN_005880e0` decomp 445738): 1 jump, 5 mount at the foot, 6 at the head, 7 ladder to slide, 8
  slide from the head, 0x14 a reverted climb-off.

**The viewer's stand-off** from the rungs is `refPt.z`'s 5.565 [viewer: the rungs 5.565 ahead of the root, as the
climb-off and slide clips' `refPt` says; the hands land on the rungs in the browser, `ladder-mid.png`].

### 2.4 The head, as the game plays it (round 3) [read]

- **The "180".** A top mount by a SEAL facing more than 90 degrees from the climb-off's facing (`FUN_00306fd0`'s cosine
  under 0, decomp 468210-468256) plays "180" -- `animset.rdr` maps it to `seal_180` (`motion.rdr`: one-shot, playback
  0.95, BlendTime 0.2, NoInterrupt; 28 keys, the root turning 0 to 180 degrees and 5.7 back) -- with the actor's yaw
  turned **by code**: `+0x44..0x4c = (0, -angle / (0.95 x (n - 1) / n), 0)`, the exact angle needed; the clip runs
  0.95 x (27/28)^2 = 0.883 s. Its end (446650-446651), like the no-turn path, runs `FUN_005b1890` (467818): the steer
  record on the reversed climb-off -- refPt (0.347, (edgeY - y) - 12.899 + 0.5, 3.2), facing -normal, target (edge x,
  edgeY - 1.412, edge z) -- and `FUN_005b2d20` backs the SEAL onto it. **The viewer** turns the yaw over the clip and
  holds the clip's own root turn at its key 0 (`TraversalPose.holdRootTurn`: whether the game shows it was not found;
  shown with the code's turn it would be a 360).
- **The slide from the head.** `FUN_00582540` (decomp 442907-442978), each tick of a one-shot not yet interrupted: with
  "Climb off ladder" (0x2e) playing **reversed** and its phase `+0x1c` under **0.2** (the reversed run's last fifth,
  the SEAL at the rungs), input slot 0 -- "Action" (`PTR_s_Action_003f2be0`, Cross) -- **held** (state 2) drops the
  clip stack and plays **"Ladderslide" directly** (`FUN_00588bc0(a, 0x3def50, 5, 0, 0xd)`, no "Ladder -> slide"), the
  slide's height `+0x2e4` the actor's y; network code 8. The pad's context action fires on the button's **release**
  (state 3, `FUN_00594cf0` 453194-453225) and the jump on its press: the viewer takes the action on release and reads it
  held.
- **The climb-off's reversal** (`FUN_0057f5b0`, decomp 441417) is **character against character**: `FUN_0054f7e0`
  (417353) tests every other character (stance radii 6 / 7 / 8, x1.75 moving; cylinders 19.1 / 15 / 6 tall) each tick
  of a forward climb-off, and meeting one reverses the clip from where it is (rate -1, network code 0x14); a reversed
  finish sets "Climb ladder" at time 1.0 (446544-446559). The viewer has no other characters: **not applicable**.

### 2.5 The mount takes the wall contact, not nearness (LDR-1, 2026-10-30) [reading, pending review]

- **The original.** `FUN_005b4b40` (D:L469562-469676; called D:L418132, D:L418155) works on the move solver's stored
  steep-wall contact (`seal+0x1090`, held while `+0x10ac`), recorded from the move's own hit by `FUN_005483d0` through
  `FUN_005b0d30` (D:L413866, section 3.1). A ladder contact is one whose polygon's `(poly[+0xA] & 0x7f) >> 4 == 2`
  (`APP_LADDER`). On it: in front, `dot(normalize(seal - contact).xz, n) >= 0.3`; facing, `dot(back axis, n) >= 0.02`
  (`|.|` for the short quad, at most 15 tall by `FUN_002dbfb0`). No button, no stick test, no radius.
- **The drop** (`FUN_005b3890`, D:L468957-469012): past 24 horizontally (576 = 24^2), behind the face, faced away
  from, and on a ladder polygon the short quad with the feet more than 10 under its bottom (D:L469001-469002), or bit 1
  of `seal+0x1061` (`<< 0x3e`, D:L469004-469005; `LADDER_DROP_FLAG_READING`: what sets it is unread; taken as never
  set). It runs before the move stores its hit (D:L413860, D:L413866), so a hit made this tick reaches the mount test.
- **The port** (`Traversal.touchLadder`): the contact from the walk's own hits (`contactFromHits`, as the climb's,
  PB-3b), the drop first and then the store; the ladder found by the contact's plane. *Was:* any ladder whose plane lay
  within the body's radius + 0.25 (`TOUCH`, uncited), in front by the ratio out / hypot(out, off-edge) -- a SEAL walking
  into the wall beside a flush ladder mounted it up to ~10 past its edge. The port keeps a stick-into test
  (`(wish . n) <= -0.02`) the original does not have (`LADDER_STICK_INTO_READING`: without it a contact held up to 24
  would snap on a SEAL who brushed the rungs and backed off facing them; a capture settles it), and matches the contact
  to its ladder record within 1 of the plane and half-width + 1 across (`LADDER_MATCH_READING`, no source).
- **A still body's contact.** The port's walk casts nothing still (research 217 s2.3); the original casts a still
  body's segments along the facing (`FUN_0054aa30`, velocity under 0.0005 a component, D:L415135-415149; research 217
  s2.1). For the ladder alone the port casts the centre one -- `step_height` 6.5 up, 1.1 x 1.4 x r = 5.39 ahead -- when
  the walk met nothing and the body is still, so a SEAL at rest at a ladder's foot mounts on the command that pushes him
  in, as before (`roomStillReloadJump.test.ts` PAR-28 end 2). The cast's local-player-only rule (research 217 s2.1's
  note, D:L415036-415055: the controller vtable +0x30, bit 0 of +0x268 under the 0x44d4d0 flag) is not modelled: every
  actor casts, room bots and remotes included (`LADDER_STILL_CAST_ACTORS_READING`).
- **Tests moved with it.** `doorClip.test.ts` LATER 560's rig put its ladder in the moves' list only, not the hull: it
  now packs it into the hull (a ladder is mounted on a contact). `botLadder.test.ts` LF3's "at least one mount" pinned
  two nearness mounts 8 and 6.4 past the quad's edge with no wall hit; the lower bound is dropped (the bot lane owes a
  leg that meets the rungs).
- Pinned by `traversal.test.ts` "LDR-1" (5 past the edge: no mount; over the quad: mounts).

## 3. The climb

### 3.1 The contact and what is climbable [read]

The move solver `FUN_005483d0` records at `actor+0x1090` via `FUN_005b0d30` the best steep hit of its segment records
whether or not it climbs (D:L413866), and clears a climbable one at an inside corner (D:L413867-413901; research 281
s4.1, PAR-21a, reading, pending review). The rule "replaced when the new one is climbable, the old is not, or the old
is more than 24 away" is the branch with no steep hit (D:L413618-413671), and its candidate is not a wall the move met
but the weapon line's slot `actor+0x1140` (`FUN_005b0c70` D:L467345-467365; cleared and filled by `FUN_0054d9a0`
D:L416434, D:L416630-416687, its segment `FUN_0054e8f0` D:L416858-416910) -- **built 2026-11-04** on the segment arm
(SEGMENT-BODY part 2, `agent/segment-body`; reading, pending review; s3.8 "The oblique climb"): `Walker.weaponLine` casts
it, `Walker.storeContact` takes it by the three replace rules (D:L413627-413668), and the offer reads the Walker's one
stored contact (`Traversal.keepContact`). *Was:* "not built in the port (research 281 s4.1)". `FUN_005b3890(actor, 0)` (decomp 468959) drops
it past 24, behind the face, or facing away (dot <= 0). *Was:* "The move solver `FUN_005483d0` (decomp 413610-413670)
records the wall it hits at `actor+0x1090` via `FUN_005b0d30`, replacing a stored contact when the new one is climbable
or the actor is more than 24 from it". **No forward rays**: the only ray is
`FUN_0054e430`'s, when the polygon's top + 0.5 is under actor y + 21.1: from the actor toward the contact x 1.1 at the
top + 0.5; its nearest hit, steep, not VOLUMETRIC or LIQUID and on another collider, replaces the stored contact
(`FUN_005b0d30` at D:L416793, the gate D:L416775-416792). The port casts it (`obstacleRay`) for the offer only and does
not store its hit -- a named departure (research 281 s4.1, PAR-21a F1). *Was:* "when the polygon's bottom is under actor
y + 21.1: from the actor toward the contact x 1.1 at the bottom + 0.5, a steep hit there replacing the contact (not
modelled)" -- the height is `FUN_002dbfb0`'s first point (D:L416734, D:L416745), the one the offer takes as the top
(D:L469252-469262).

| `appflags` | the climb (`FUN_005b2620` 468288, `FUN_005b3ce0` 469088, `FUN_0059d9f0` 457413) |
|---|---|
| 1, 3 | by the height, `FUN_00580b70` |
| 2 | the ladder: `FUN_0057f7d0` for a quad <= 15 tall, else `FUN_0057f9c0` |
| 4 | by the height only for 5 < h <= 32; for 5 < h <= 10 it steps up with no press (decomp 469259-469276) |
| 5 | always "Climb over" (`FUN_00580a80`) |
| 0 | never |

### 3.2 The facing and the height [read]

The facing (from `*(actor+0x28)`'s rows, horizontal, normalised) against the wall's normal >= 0.3 (about 72.5
degrees; decomp 469208, again in `FUN_005b4b40`), and the direction from the contact to the actor within 0.3 of the
normal (`FUN_005b2620`). The height `h` = the polygon's top (`FUN_002dbfb0`) + a material term
(`DAT_0044f358[mat] + 0x38`, read as `FOOT_STEP_OFFSET`, unverified; left out) - the actor's y, measured wherever the
actor is -- in the air too.

### 3.3 The height's table (`FUN_00580b70`, decomp 442174; all literals) [read]

| h | the clip (standing or crouched; prone does not climb) |
|---|---|
| <= 5 | nothing |
| 5 .. 10 | "Step up" |
| 10 .. 12 | 0x2a "Climb crate" |
| 12 .. 26.5 | `FUN_00581110`: crate at weight 1 - (h - 12) / 14.5, medium the rest |
| 26.5 .. 28 | "Climb medium" |
| 28 .. 32 | 0x21 "Stand -> Hang", 0x22 "Hang" |
| > 32 | nothing |

From the hang (state 4, `FUN_00581c10` decomp 442605): 0x23 "Hang -> Climb" or 0x24 "Hang jump down". **The viewer**
plays the heavier of the crate/medium blend (the animator plays one clip), its path stretched to `h` [viewer]; pulls up
on the stick ahead or the action button and lets go on the stick back, the jump-down clip not played [viewer].

**Round 3: the blend and the height, as the game weighs them** [read]. `FUN_00581110` (decomp 442306-442340) starts a
"Climb medium" play (`FUN_0028dc90`), then swaps in two nodes without a blend (`FUN_0028bef0` 133999; weights normalised
by `FUN_0028bdf0`): the crate at `w = 1 - (h - 12) / 14.5`, the medium at `1 - w`, each at speed 1. The phase runs at
`w / (1.25 x 29/30) + (1 - w) / (1.5 x 31/32)` a second (`FUN_0028c4f0` 134225) to the medium's end 31/32 (the play
was made for it: `FUN_0028cc10` 134485-134493): 1.171 s at w = 1, 1.278 at 0.5, 1.408 at 0 [derived]; each node samples
`phase x n`, the crate held at key 29 (`FUN_0028d670` 134881-134899). refPt: x and z the crate's, y `w x 1.48 + (1 - w)
x 9.98` (`FUN_005b1a10` 467893-467898). The vertical motion is the weighted root velocity (`FUN_0028c250`
134149-134183), UseVelY from the first node (`FUN_0057b510` 439215-439223). **The viewer plays both** (a two-node
`trav:` play in the animator, `TraversalPose.blend`) and carries the feet on the blended root (`blendShapes`).
The height adds the contact polygon's material's `FOOT_STEP_OFFSET` (`+0x38`, the parser 181399-181401; default 0,
`FUN_002deb30`): -0.8 on GRASS, BROKEN GLASS, LEAVES, ICE, SNOW, GRAVEL (the hull's 4, 14-18), 0 elsewhere.
`FUN_005b3a60` (469016-469080; the scale from the disassembly at 0x5b3bb0 / 0x5b3c10) pulls the target to 3 from an end
it is within 3 of, takes the midpoint when both are, and always the midpoint for appflags 1.

**The obstacle ray** (`FUN_0054e430`, decomp 416696-416790), called only by the climb offer `FUN_005b3ce0` (469246)
each frame: at Y = the contact polygon's **top** + 0.5 (`FUN_002dd4d0`'s highest point; cast only when Y < the feet +
19.1 + 2.0), a level segment from over the feet to 1.1 of the way past the contact, against all collision (the actor's
own collider off); its hit replaces the contact (`FUN_005b0d30`) when steep (`n_y <= 0.6428`, `max_slope`'s cosine,
`DAT_0044c268`), of no VOLUMETRIC or LIQUID material, and on another object (D:L416775-416793; only the nearest hit
is asked, D:L416772). When the contact polygon gives no top (`FUN_002dbfb0` returns 0) the ray is cast at the head's
height instead -- the head node's y over the feet -- if the stored hit point's y is under it less 0.1
(D:L416735-416743). Implemented (`obstacleRay`, its filter `moveHit`'s since PAR-21a's re-review: the normal's y signed
against `max_slope`, VOLUMETRIC and LIQUID asked; was `|n_y|` and water only) for the offer only: the port does not
store the hit, passes over a hit on the contact's own owner or a rejected one to the next (a downward face steeper than
about 44 degrees, normal y under -0.714, among them: it passes the original's filter and is stored there, but the port's
`contactOf` refuses it as no wall), and does not model the head-height branch -- named departures (research 281 s4.1).

### 3.4 The button, the icon, the jump-grab [read]

- **Action = Cross.** `controller.rdr` Default: X -> Action, Square -> Jump; the logical Action is 0 and Jump 5 (the name
  table at 0x3f2be0). In `FUN_00594cf0` (decomp 453187-453243) Action state 3 calls the controller's `vtbl[0x78]` =
  `FUN_00592d50`, whose bit 4 (decomp 452182) sets `m_action_climb` (0x105e bit 1; reCOM `zseal.h:729`) and a latch the
  next tick's `FUN_00550ef0` (418120-418155) turns into `FUN_005b4b40` (469562), which re-checks the facing, calls
  `FUN_005b2620` and zeroes the velocity. With Jump and Action on one button (the "Goldeneye" config, `FUN_002c63d0`) a
  press jumps only if the stick moves or no action is offered.
- **The icon.** `FUN_00593500` (decomp 452227, every frame through the HUD, 73390) sets bit 2 of the action mask
  `+0xed0` (`FUN_00544ca0(actor, 2, 1)`) when `FUN_0059d980` finds a climb of type 3, 4, 1 or 5 -- **also while
  airborne** (0x105e bit 5, `FUN_00587f50` / `f10`): that is the jump-grab's icon. The bitmap is `action_climb.tif`,
  entry 2 "CLIMB" (0x3e4e00) of the texture set `0x45c3c0` (`FUN_0021ded0`, decomp 73549, 73614-73621); on a ladder
  entry 0x10 "LADDER SLIDE" is `action_slide.tif`. Both are in `RUN\COMMON\HUD_TXR.ZED` with `HUD_PAL.ZED` [data].
  The panel is centred at x 306 of 640, half-width 25, y 365-415 of 448 (`DAT_003dc628/630/640`, `DAT_0040c160`
  decomp 327763), its tint pulsing base + t x delta at rate 5 (`FUN_0021f120`, 73840).
- **The jump-grab.** `h` is from the airborne y, so a jump brings a ledge up to 36 into the table's 32 while the
  contact holds; the press can come any time the icon shows. No exact window figure exists: it is the table and the
  contact.

### 3.5 The steer and the move [read]

`FUN_005b2d20` (decomp 439017, from `FUN_0057a330`) steers the actor until `R x refPt` lands on the target (the contact
on the top edge kept 3 from its ends, or the edge's midpoint, `FUN_005b3a60`): at most 30 a second on each axis and
4.712 radians a second of turn, stopping at facing > 0.993 and inside 1, or after 46 ticks, abandoning past 30. Extra
offsets: "Stand -> Hang" (0, 11.78, -2.42), "Climb over" (0, -0.29, -2.42), "Step up" `refPt.y` + 1.

**Round 4 (2026-09-29, the owner's "reached far above the ledge"): the steer is vertical too** [read]. `FUN_005b2d20`
(decomp 468517-468748, called from `FUN_0057a330` while the steer record lives, i.e. as the clip plays) sets a velocity
on **all three** axes, each clamped to +-30 a second: the target (`+0x8c`, whose y `FUN_005b1a10` copies from the
contact polygon's top point, 467887) less the actor's position, its root (`vtbl+0x88`) and the turned `refPt`. Under a
`UseVelY` clip `FUN_0059afd0` holds the root at most 11.487 over the actor (456455-456460), so the body is lifted or
lowered by `top - (feet + 11.487 + refPt.y)` -- the clip's hands meet the ledge whatever the height, the clip is never
stretched to it. The viewer had only the horizontal steer and spread the height mismatch over the rise, so at the pull
the hands were +2.2 over a 10.5 ledge, -2.4 under Frostfire's 18.96 crates, -6.7 under a 27.5 ledge, and **+5.9 over
Frostfire's 30 containers while hanging** (the hang drawn on "Hang -> Climb"'s 18.14 root, not the held one). Now
`ClipPath`'s `lift` applies that shift from the clip's start at 30 a second and the hang holds the body where "Stand ->
Hang" left it: at the pull 0 to -0.1 for the crate, to -1.7 for the medium (the clips' own grab), -0.88 hanging at
28.5-31.5 (`test/traversalBody.test.ts`). A crate under 13 lowers the body: at 10.5 the soles go ~1 under the floor for
the steer's first ticks (gravity is suspended through these clips, `FUN_005af930` 466760; whether the game's collider
stops the actor there is not read).

### 3.6 Climbables for the tests [data]

`appflags` 4 is on 20 maps (MP2 359 polygons, MP12 151, MP6 89, MP1 68, MP81 62, MP61 57 ...), 5 on MP1 (100), MP6
(8), MP81 (3). Frostfire's, pinned by the tests: the crate `worldmodel/crates1/prop02` at x 922.8-940.6, z 761-778.1,
top 111.85 (h 11.9: "Climb crate", approached from z 790 at x 938, clear of the 19-tall `prop01` beside it); the
container `container_blue01` at x 680-720, z 640-680, top 130 (h 30: the hang). MP6's `crate05/mp6_justbox1` (13 tall,
`appflags` 5) is a climb-over; `wall_low3` / `wall_high2` (`appflags` 4, 29.5-30) are hangs.

### 3.7 The hang, as the game plays it (round 3) [read]

The state-4 handler is `FUN_00584390` (decomp 443780; `FUN_00581c10` 442607 only picks the exit clip): the stick at
rest (0.03) holds the hang with no timer; ahead climbs ("Hang -> Climb", 443810); any other push -- back or aside --
lets go ("Hang jump down", 443830). The jump latch lets go (`FUN_00581dc0(a, -1)`, 418136-418138), as does an action
with nothing offered (451991-451994); a stance button climbs on stand and lets go on crouch or prone (`FUN_00581ed0`
442695-442732, 418877-418906). "Hang jump down" (0x24, `seal_hang_jumpdown`, 1.5 s) is **not** gravity-suspended
(466760-466790): `FUN_0059afd0` (456390-456395) takes the height from the clip's root only for its first 0.2 -- the push,
the root 18.82 up to 21.30 by key 7 and back from the wall -- and from the fall after; the clip plays on through it.
The viewer runs that (`hangDown`, `hangDropFall`). "Ledge -> Hang backwards", "Hop down forward / backwards": **nothing
in this ELF plays them** (0x25 only on a branch no caller takes, 442360; 0x26 never; 0x2b only tested, 418310); no
climb down is offered at a ledge.

### 3.8 The climb's facing, and the owner's "turned around and climbed the wrong way" (round 6, 2026-09-29) [read, viewer]

**The game's rule** [read]. The facing is the body's, never the stick's or the camera's apart from it (in SOCOM II the
look's yaw is the body's): the offer `FUN_005b3ce0` takes the actor matrix's third row, horizontal
(`*(actor+0x28) + 0x20`, `+0x28`, decomp 469213-469218), dots it with the contact's normal and wants >= 0.3
(section 3.2); no forward probe picks the wall (section 3.1: the contact is the move solver's). So **walking backwards
or strafing into a box offers nothing** (the facing is 180 or 90 degrees off), and neither does a look more than 72.5
degrees away. On the press, `FUN_005b2620` hands the contact's normal (`pfVar13 + 4`, 468504) to `FUN_005b1a10`, which
stores it **negated** at the steer record's `+0x7c` (467938-467946): the facing to reach is into the wall, the
polygon's, not the probe's or the stick's. `FUN_005b2d20` (468637-468680) turns to it by vectors: the target facing
brought into the actor's frame by the rotation's conjugate (`FUN_00306fd0` with `-q.xyz`), `acos` of its dot with the
frame's forward (`DAT_003f6500`) over the tick's time, clamped to 4.712 a second, its sign from the cross product's y
(`FUN_001bfc78`; `fStack_ec < 0` negates it). **The turn is always the short way** -- there is no angle to wrap.

**The viewer's fault** [viewer, measured]. `align` and the ladder head's `mountTop` took the turn as
`((want - yaw + 540) % 360) - 180`. JavaScript's `%` keeps the dividend's sign, so for a yaw more than 540 over `want`
the result is -180 or under: the SEAL spun the long way. The page's camera yaw is never wrapped (`camera.ts` adds the
mouse's turn to it; only the net command quantises it to 0..360, so an online mover never saw it), so two turns to the
left were enough. At 4.5 degrees a tick, `FUN_005b2d20`'s 46 ticks ran out mid-spin and the clip played with the body
off the ledge while the feet went onto it. Frostfire's crate `crates1/prop02`, its west face (x 922.8; the plan's yaw
-90), approached head on at yaw 630 (-90 two turns round): **153.0 degrees off the clip's travel as it started, the
body's facing against the feet's travel -0.89 at worst, the feet 0.92 short of the head-on end**; at yaw 700 on a
synthetic 12 crate 133 degrees off. Every other approach was already right: head on 0 degrees; 30 and 60 degrees
either side turned the short way and climbed (0 off); backwards, strafing either way and 85 degrees off offered
nothing (the facing test); the south face's inside corner with `prop01` (x 916.6-934.4, z 778.1-795.2, 18.96 tall) and
the north-west outside corner climbed whichever face the contact held, facing it; standing against it then pressing,
the same. The ladder head at yaw 720 played a needless full-circle "180" before a mount that wanted no turn.

**The oblique climb: settled against a capture of the original** (2026-11-04; SEGMENT-BODY part 2, `agent/segment-body`;
the weapon line built, reading, pending review) [capture; read; viewer, measured]. *Was:* "two readings, unsettled
(parity clause 7)".
- **The capture** (proven: a capture of the original running; ac, PCSX2 r0004 alone, offline, 2026-11-04 08:31-08:43Z,
  `agent-mail/evidence/eph-hunt-2026-11-01/segment-body/climb-angle/RESULTS.md`, two trials a case): M51
  `worldmodel/guardwall/g19733`'s south face (plane 0.983 x - 0.184 z = 3162.3, 14 over the floor), from slot 18 at
  (3826.5, -182.91, 3175.3), walked in at stick 0.5. The original offers CLIMB at 0, +-15, +-30 and +-60 degrees and on
  the crouch walk at 30, and every press climbed. Standing still 15 out it offers at 0 to +-30 before any walk; at +-60
  the offer comes on during the walk-in, the contact word set with the feet 10.4-11.0 from the plane and the offer a
  frame later; the offer drops while the body slides along the face and returns once it stands; facing away clears the
  contact word `+0x10ac`.
- **What forms the contact: the weapon line** (s3.1). `FUN_0054d9a0` clears the slot `actor+0x1140..+0x115c` as the
  tick begins (D:L416434) and fills it from one level segment (D:L416630-416687): from the feet raised by the skeleton
  root's height (`FUN_0054e8f0` D:L416877-416880), along the facing (the matrix row +0x20 negated, D:L416886-416891),
  2 x the held weapon model's x extent long (D:L416892-416902) plus the tick's displacement (D:L416904), level
  (D:L416905); the nearest polygon crossed that is not VOLUMETRIC or LIQUID, at any slope (D:L416644-416672); only with
  no slide speed (D:L416634), a weapon held (D:L416869-416870) whose model's `aimpoint` (`+0x14ac`, D:L416874) and
  `firepoint` (`+0x14bc`, D:L416882) nodes were found at the mount (the body's slot +100, research 202 s3.10; both on
  every firearm's model, `weaponLine.test.ts`), outside the turret set (D:L416635) and for a body whose controller's
  vtable +0x2c answers (D:L416630-416633). `FUN_005483d0` copies the slot into the contact when none of the
  segment records hits (D:L413618-413671): when no contact is held, or the slot climbs or is a ladder
  (D:L413627-413645); else when the held one does not climb (D:L413646-413657); else when the feet are more than 24 from
  it (D:L413658-413668); such a tick runs no drop check.
- **The slot is the contact** (proven: a memory read of the original running; ac, r0004, 2026-11-04 09:16Z,
  `climb-angle/WEAPON-LINE.md` section 4): in the still frame facing square, CLIMB on, `+0x1140..+0x115c` and
  `+0x1090..+0x10ac` hold the same eight words -- the point (3811.99, -171.464, 3178.99) on the face's plane, the
  polygon, the normal (0.983, 0, -0.184), the set word.
- **The kit held** (fresh review 1's F1, part 4): the length is the held weapon's -- the kit entry the hand byte `+0xf79`
  picks (D:L416869-416870). The room's body takes its kit's two firearm models at each spawn and at a pickup
  (`./loadout` `heldWeaponModels`, by `slotModel`, into `Walker.heldModels`; match `room.ts` `spawn`, `worldDrops.ts`
  `take`), the page's at its `spawnKit` and `takeKit` (`WalkMode.setHeldModels`, carried to every mover the walk makes).
  An MP5 casts 16.0, a Barrett 28.5052 (match `weaponLineKit.test.ts`). With an item up the port keeps the firearm's
  model (`WEAPON_LINE_ITEM_MODEL_PLACEHOLDER`). A pickup's kit reaches the page when the room's `kit` event does, a
  few ticks after the room's body took it.
- **The length** (`./weaponLine` `WEAPON_LINE_LENGTH_READING`, s7.2): `|b[3] - b[0]|` of the held model's +0x40 bounds
  through `FUN_001b3620` (D:L416901), twice (D:L416902). `FUN_0054e8f0` takes `FUN_00541510(+100)`'s bounds instead
  only when bit 6 (0x40) of the model's byte +0x5f is set -- the byte shifted left 57 and tested for sign (D:L416894) --
  not bit 7 as ac's note and the investigator's read first had it (6d's correction, ibid.): the M4A1 SD's byte is 0x80,
  so its own bounds, x -3.679799 to 7.785366: **22.930, proven** (the RDRAM read), inside the capture's 22.5-23.4
  bracket for the reach. The runtime model is the weapon's `WEAP_GEO` root (its `nparams` bbox at +0x40 and flag word at
  +0x5c read the same off the disc, the word 0x80800055 against RDRAM's 0x80800855); every one of the 59 models'
  lengths is a reading of the disc's bounds, and none sets bit 6 (`weaponLine.test.ts`).
- **The height**: `*(+0x2e8)` is the `skel_root` part (research 180 s1.3) and its `+4` the root's height -- a field's
  offset, not 4 added: the capture's stored point sat 11.486 over the feet (-171.464 against -182.95), the port's
  standing root is 11.484 (`STANCE.stand.rootY`, the console dump's). The port casts from the stance's root
  (`rootY(posture)`), not the posed root of a clip in play [reading: the stance's idle root].
- **Built**: `Walker.weaponLine` (cast before `resolveSegments`' records, on the unresolved displacement),
  `Walker.storeContact` (the slot branch; and the corner drop over the records' own hits, D:L413864-413901, moved there
  from the climb's `cornerDrop`), `Walker.storedContact`, and `Traversal.keepContact` reading that one contact on the
  segment arm (the original's one `+0x1090`; *was:* a second contact of the port's from the walk's centre and head-line
  hits). The climb still asks `FUN_005b3890`'s drop every tick (`Walker.holdContact`; the named departure of research 281
  s4.1). Held by `weaponLine.test.ts`: the capture-scored dev-disc spec on M51 g19733 -- (i) still 15 out, offered square
  and at +-30, not at +-60; (ii) walked in at +-60, the offer comes on with the feet 11.05 from the plane (the band 9.5 to
  11.5); (iii) the closest approach at +-30 and +-60 within the capture's range (6.41; 6.19-6.20) -- and a synthetic twin
  with no disc; and by `climbFacing.test.ts` (d) and (f), staged as the capture (walk, stop, press).
- **Owed, LATER 681**: walked in square the port's segment body stops a whole step short of the crossing, 5.66 from the
  plane at stick 0.5, where the original closes to 5.34-5.40 (`weaponLine.test.ts`'s `it.fails`); the weapon line plays
  no part.
- **Owed, LATER 682**: the line keeps any slope, so run straight up Frostfire's 26.6-degree rail ramp it stores the
  ramp's own floor 23 ahead and the running jump is refused (`walk.test.ts`'s rail-ramp case held as `it.fails`);
  whether `FUN_0031e160` queries floors at all is unread (`WEAPON_LINE_POLYGON_SET_PLACEHOLDER`, which alone decides it).
- **The rejected reading** (kept with its evidence): "only hits on the first two segment records -- the centre and the
  head line -- can become the stored contact (`FUN_005483d0`, D:L413823-413848) ... for a walk-in at an angle theta the
  leading side line reaches the face first once tan(theta) > 0.49/4.2, about 6.7 degrees: the centre never meets it,
  nothing becomes the contact, and no climb is offered. A still body keeps a contact it already holds (the moving test
  D:L413459-413461; only a moving body with no hit re-checks it, `FUN_005b3890`, D:L468975-469012)". Its record geometry
  stands -- the side lines do take the move, and the stop distances they give (6.4 at 30, 6.2 at 60) are the capture's
  -- but the contact has the second source it left out, so "no offer past about 6.7 degrees" is contradicted by the
  capture. "A still body keeps a contact it already holds" is re-filed: a still body forms one through the weapon line,
  and turning away clears it in the original; which code clears it on a still turn is unread (perhaps the turn's root
  motion makes it a moving tick, D:L413459-413461; low confidence).
- **Open: the offer's direction test** (a named departure, reading, pending review). The offer `FUN_005b3ce0` tests the
  facing only (>= 0.3, D:L469243) -- no direction from the contact. The press `FUN_005b2620` tests the direction between
  the contact and `actor+0x2bc` (D:L468360-468366, the 0.3 at D:L468416), and `+0x2bc` is the feet where the slot was
  stored (D:L413637-413639) or the record branch's `iStack_38` (D:L413904-413906), unread. The port's `planClimb` takes
  the press's test against the feet as they are, for the offer and the press alike; left as it is until that point is
  read -- with contacts up to 23 out it can end a 60-degree slide's offer before the original's 24.
- **Consequences, the reading's** (pending review): ~~the running jump wants no stored contact (`FUN_0057e1b0`
  D:L440815-440819), so a running jump pressed within the line's reach of a face ahead is the standing jump~~ --
  **rejected 2026-11-04 by ac's r0004 jump-near-wall capture** (the running jump launched 17.43 out with `+0x10ac` set
  and CLIMB offered, carrying 64.5 u at 62.3 u/s; `JUMP_CONTACT_PROVEN` 'none', research 217 s2.9; the r0001 branch kept
  there as the rejected reading): the running jump reads only the speed, so the jump-grab is pressed 16 out again
  (`traversal.test.ts`), the 40-tall app-4 crate climbs again (`botClimbNavigation.test.ts`, LATER 683 closed) and
  Frostfire's rail ramp lands (LATER 682 closed); in an inside corner where
  only the side records meet the faces, the contact the line stored on the way in holds and the climb is offered
  (`traversal.test.ts` C2 at 30 and 90); at an outside corner walked in on its edge the moving side record's crossing of
  the end face clears the contact (no `'span'` question for a crossing; `CORNER_HITS_READING` stays the disc arm's);
  Frostfire's box from x 938 (LATER 680) stays without an offer -- the -x side record meets `prop01` on every moving
  tick from z 801.1, where the body is held, and still there the line's 22.93 ends 0.1 short of `prop02`'s face.
- **Placeholders** (s7.2): `WEAPON_LINE_ONE_SIDED_PLACEHOLDER` (whether the line's query is one-sided),
  `WEAPON_LINE_POLYGON_SET_PLACEHOLDER` (which polygons it returns, floors or not: LATER 682),
  `WEAPON_LINE_ITEM_MODEL_PLACEHOLDER` (the length with an item up); the reading `WEAPON_LINE_BOTS_READING` (the bots
  cast none: the AI controller's +0x2c answers 0).

**The fix**: `shortTurn(from, to)` (`traversal.ts`), the signed short turn in [-180, 180) for any winding, in `align`
and `mountTop`. After it every approach above starts the clip within the steer's 6.8 degrees (0 measured), the feet end
where the head-on climb's do, and the ladder head at any winding mounts straight. The mover stays deterministic (plain
arithmetic on the same yaw; the server's is the quantised command's). Pinned in `test/climbFacing.test.ts` (Frostfire,
and a synthetic box and ladder that run without the disc).

**The yaw's one arithmetic** (round 6, `yaw.ts`) [read, viewer]. The game's facing is the actor's rotation (the
quaternion `piVar10[0x14..0x17]`, 468642-468645), so it has no winding; the viewer's degrees are kept equivalent by two
functions and nothing else: `shortTurn` (above, moved from `traversal.ts`) for every difference of two yaws -- the look
rate (`main.ts` `gunFrame`, the server's `ShotCone`), the turn rate (`walk.ts`), the snapshot interpolation
(`net/client.ts`), the room's idle test (`room.ts`, which read 0.1 -> 359.9 as a 359.8 turn) -- and `wrapYaw`, the
canonical [0, 360) the wire already reads a yaw back in (`net/codec` u16 a turn), for every stored yaw: the page camera
(`camera.ts`, radians [0, 2 pi) at each write), the mover's look (`walk.ts`), the play snapshot (`moverSnapshot`), the
spawn's facing and the bots. Spun two turns either way the walk gives the same look, aim, round, command bytes and climb
as never turned (`test/yawWinding.test.ts`).

## 4. The peek

### 4.1 Input and conditions [read]

`FUN_00594cf0` (decomp 453431-453457) resets the peek byte `seal+0x375` to 2 (none) each frame; it is 1 (right) while
pad button 5 is held past 0.03 of its pressure 0x14, 0xFF (left) for button 7 / pressure 0x15 -- libpad2's **d-pad
right and left** (the game's packer pairs them, decomp 179819-179861; 0xc Triangle, 10 L1, 0xb R1, 8 L2, 9 R2).
Held, not toggled; on or off, not analogue. Blocked while Triangle is held, dead (state 8), or when the side ray
`FUN_00596d60` hits (9.5 right, `0x41180000`; 7.8375 left, `0x40facccd`; at `min(8, ...)`), or when
`FUN_005b4340(seal, 1)` fails (state 0-3, grounded, not carrying, not in a jump or a landing clip: ids 8/9
`FUN_00587f50`, 10/11 `FUN_00587f10`, 469348-469349, and "Jump", 469353). `FUN_0057d810` (decomp 440451-440530) plays "Peek left/right" (0x1d/0x1e), "Crouch peek left/right" (0x1f/0x20) or "Prone peek left/right"
and sets state 3; the release goes through `FUN_0057dc80` (440560). **No locomotion in state 3**
(`FUN_005870e0`: `case 3: case 8: break`, decomp 445166-445175), and the start wants a still SEAL (`FUN_00587c20`,
read as such). The web (review 2, M-1): `FUN_005b4340(seal, 1)` (469321-469346) takes the peek only in states 0-3
and, outside state 3, only while `FUN_00587c20` says the action on top gives way -- `Walker.actionInterruptible`, never
a knock's fall or a death landing -- and the hold (the kit's one-shot) refuses it; the dead never peek (453432,
418606-418611). A peek started over an action that gives way ends it (`PEEK_CUTS_ACTION_READING`, section 7.2).
Review 3 (A1): `FUN_00587f10` is not a reload test. It is `FUN_00577e40` (437396-437411, the top clip's id at
`actor+0x534`) on ids 10 and 11, `Jump land` and `Jump land hard` (research 80 section 1), which `FUN_005af590` pushes
(466663-466694). `FUN_00587f50` is the same test on ids 8 and 9. The peek is refused for the whole of a landing clip,
whatever its `NoInterrupt` (`Walker.leanRefused`). The gate runs every frame the button is held (453938). For a SEAL
already in state 3 it skips `FUN_00587c20` (`state == 3 ||`, 469345), so a hold taken from the peek (the lean's toss,
section 4.4) leaves the peek held, and the toss's clock runs under it (`Walker.runHold`). A still reload taken mid-peek
is left the same way: the original pops nothing for it in state 3 (research 217 §3.2, PF-20's review).
Review 4: only `FUN_00587c20` is skipped in state 3; the ground, jump and landing tests (469347-469353) follow the
short-circuit and run for a SEAL already peeking, every frame (`Walker.leanRefused`). A jump press while peeking is
refused: the lean clip is the stack's top, held on its last key and not looped (section 1's table), and `FUN_0057e1b0`
(440776-440867) jumps only over a looped top (`FUN_005551a0(top+0x28, 0x40)`; `TickDriver.topOneShot`). A stance press
pops the stack, the lean with it (442452-442467, 442559-442575, 442582-442598), so the SEAL leaves state 3; until PF-20
the web then played the stance's transition; since 2026-10-05 the press ends the peek with no transition and the
stance kept, the held lean peeking again the next tick (research 217 §3.1; `PEEK_STANCE_ENDS_PEEK_READING`).

### 4.2 The camera [read]

`FUN_002998f0` (decomp 141962-141976): the target is -1 for 0xFF, +1 for 1, else 0 (and 0 for state 2 prone-not-peeking
or 8); `DAT_004161c0 = target + (DAT_004161c0 - target) x exp(-cam_peek_decay_rate x dt)`, the rate `DAT_0044c3bc`
= 6 (`dynamics.rdr`; the static default at decomp 328433 is 6 too): a time constant of 1/6 s, 95 % in 0.5 s.
`FUN_0029a950` (decomp 142478-142484): the actor-space x of the target and of the eye's (0, 0, 28) is `peek x 2.5`
left and `peek x 2.8` right, before the look quaternion (`FUN_0029a660`'s far camera the same, 142365). First person
(`FUN_0029ae50`, 142613-142617): the eye node + `peek x 3.3` left, `x 4.35` right. While the peek is not 0 the pass
`FUN_0029bf70` sets `FUN_002d4fd0(DAT_004161c0 == 0)` (143369-143373): the movement's surface mode (bit 18 skipped,
not bit 19). The `cam_peekl/peekr` side, height and dist go into a throwaway local in the loader `FUN_0059ba80`
(456637); the aim triples into a vector indexed by `cam+0xe4`, whose view-cycle `FUN_0029b0c0` (142653-142657) skips
indices 1-4: dead data. `camera_roll` has no reader.

**Round 4 (2026-09-29, the owner's "not enough peek, it recentres"): the aim does not take the shift** [read].
`FUN_00297410` (decomp 140987-141028) makes the far point `targetL + rotate(actor+0x1070, (0, 0, -1000))`: the look
quaternion turns a straight-ahead vector, not `v`, so the peek moves the eye (about 2 x the shift out: 5.6 right, 5.0
left at a level pitch) and the target across and leaves the aim parallel to the facing (0.16 degrees in). The viewer
aimed along `-n`, which carries the shift, so the view swung 5.8 degrees back toward the body as the peek eased to its
hold -- the recentre -- and the rounds went there too; fixed in `playerCamera.ts` (`LocalCamera.ahead`). The lean clips
hold their last key with no return (head 4.0 across standing right, 2.6 left); the skeleton root's x and z are 0 in the
game as in the viewer (`FUN_0057a330` zeroes them, 439147-439148), so nothing else shifts the camera.

### 4.3 The body [read]

Full-body clips, held on their last key (section 1). No hitbox shift in code (hit regions are per bone,
`damanim.rdr`, and follow the skeleton [inference]). `FUN_0057fa70` (441667-441672) holds per-stance points
(peek right (7.55, 9.78, -2.54), left (-0.24, 8.87, 5.11)) the AI reads (424337); meaning unconfirmed.

### 4.4 The throw from a peek (round 3) [read]

`GetThrowAnim` (`FUN_0057fce0`, decomp 441707-441880), state 3: by the lean clip playing (`FUN_00577e40`), "Peek right
toss" (`seal_toss_rlean`, release at 0.55, 0.668 s) for the standing or crouched right lean, "Peek left toss"
(`seal_toss_llean`, release 0.87, 1.007 s) for the left -- whatever the power or the aim; the grenade leaves the left
hand for the left toss (decomp 477060-477065). **A prone peek has no throw**: its lean types are not tested, the
function returns 0 and the caller clears the throw (475499-475510). The throw leaves the peek as it is (the toss is
pushed over the held lean). The viewer: `PlaySnapshot.peek` (the lean held), which `grenade.ts`'s stance maps to the
peek stances, refusing the throw prone.

## 5. The water

### 5.1 How water is marked [read, data]

`materials.rdr`'s `LIQUID` flag sets material `+0x3c` bit 1 (parser decomp 181411-181414; `VOLUMETRIC` bit 0,
`UNDERWATER` bit 2, `PICKUP` bit 4). **The hull's `m_material` is the SOILS index two past the reader's order**
[data, census]: 11 is `WATER` (flat surfaces, `|n_y|` 1.00, on 14 maps: MP64 212 polygons, MP53 34, MP62 22, MP12 20,
MP52 9 ...), 12 `UNDERWATER` (the beds under them), 9 `GLASS` (Frostfire's window panes, MP6's bottles), 25
`METAL_THICK` (Frostfire's `DefaultMaterial`, 1,357 of its 3,318). No fixture map (MP2, MP6, MP72) has water.

### 5.2 The wade [read]

- In the ground probe `FUN_005b5d40` (decomp 470160-470243) a LIQUID hit is no floor candidate; it goes to
  `FUN_005b52b0` (469852): the depth `+0xf88` = the water's y - (pos.y + bbox.minY), the water over the feet, the
  in-water flag `0x105e` bit 7. The SEAL walks on the bed.
- `FUN_005b56c0` (decomp 469966-469975, 470153): `f = clamp(1 - depth x water_factor_slope, min_water_factor, 1)`, with
  `dynamics.rdr`'s **0.05** and **0.75** (the ELF's static 0.066 / 0.6, decomp 328407/328410, are overwritten): 0.75
  from 5 deep. It multiplies both stick axes (after an uphill factor, `sqrt(1 - d^2)` squared of the ground normal
  `+0x410` against the move axis -- not modelled), not in the air, standing (`FUN_00586570` 444865) and crouched
  (`FUN_00584c60` 444163/444173), not prone.
- Stances: prone only to 2 deep (`FUN_00581660` 442448, `FUN_00584c10` 444028; deeper, crouch `FUN_005845c0` 443864),
  crouched only to 8.5 (`FUN_00581990` 442553, `FUN_005857e0` 444354; deeper, stand 444080), the crawl moving only to
  1.5 (`FUN_00583500` 443387). No swim state, no drowning, no depth limit.
- Effects (decomp 460997-461004, `FUN_0026a250`): `big_ripple_anim` / `_walk` / `_run` by `FUN_0058a820` (speed^2 < 0.25,
  < 400, else), `small_ripple_*` for a water line 0-10 over the box top, `seal_fall_in_water` on landing from the air
  (469892-469896); the steps are the material's `STEPSOUND` / `CRAWLSOUND` (`.STEP_WATER`, `.STEALTH_WATER`, `.WATER_JUMP`).

### 5.3 The slope on the stick (round 3) [read]

`FUN_005b56c0` (decomp 469966-470138), grounded, in water or not: each stick axis pushed past 0.03 is multiplied by
`1 - d^2` where `d` is the floor's normal `+0x410` against the axis's way (the negative axis for a negative push) and
`d < 0` -- uphill; 1 downhill or across; 0 at `d <= -1`. Then, in water, the water's factor. The viewer applies both
(`Traversal.stickScale`, the walk's `stickScale` seam), so a 30-degree ramp is climbed at 0.75 of the stick.

**Crouch ordering (2026-10-29, reading, independently source-reviewed).** `FUN_00584c60` preserves the input axes
at D:L444137-444138. Direction classification (`FUN_005858a0`, L444139), the idle gate (L444142) and the crouch/run
threshold (L444144-444145) use those axes before slope/water scaling. The classifier's axis writes require its fourth
argument to be nonzero (`FUN_005858a0`, D:L444365-444500); this caller passes zero. Crouch walking normalizes the
saved axes first (L444160-444162), then calls `FUN_005b56c0` (L444163), then throttle (L444164). The run branch calls
the same scaling function after its choice (L444173-444174), retaining the headroom gate at L444146-444148.
Applying slope scaling before this choice incorrectly makes a full uphill push select crouch walk and cancels the
uphill reduction on a partial push. `mover.ts` now preserves the raw crouch axes for these decisions and scales the
normalized crouch walk. The slope factor, threshold and headroom rule are unchanged. `crouchSlope.test.ts` covers
inclines, a low ceiling, diagonal classification, the deadzone, downhill/across-slope travel and shallow water.
This is a source reading and a movement regression, not a comparison with the original running.

### 5.4 The ripples and the splash (round 3) [read]

`FUN_005b52b0` (469810-469920), on each liquid hit of the ground probe: F the feet, T the body box's top, W the water:
F < W < T the **big** ripple, T < W < T + 10 the **small**, by the speed class (`FUN_0058a820` 446876: speed^2 under 0.25
`_anim`, under 400 `_walk`, else `_run`): `big_ripple_anim` / `_walk` / `_run`, `small_ripple_anim...` (`FUN_0026a250`,
460997-461003), at the water's point over the feet and following it (a tag-3 pointer). A new one only when there is
none or the last has ended; a switch of size stops the other. `seal_fall_in_water` once on a fall into water
(F < W < T, airborne, not in water the frame before; 469892-469896). The viewer runs them through the map's effects
(`TraversalPage.effectsFrame`, `Effects.spawn`). The condition bit `actor+0xe1` bit 4 was not identified (taken as set).

## 6. Crawling and headroom [read]

The headroom ray `FUN_0057efe0` (decomp 441190-441240) goes up from pos + (0, hips.y + 2, 0) to pos.y + 12 (to crouch)
or + 19 (to stand), passing when clear or when the hit's `(byte10 & 0xf) >> 2 == 1`. `FUN_00552ec0` (418916-419015)
refuses a stance change it blocks (prone to crouch needs the 12, anything to stand the 19), so a SEAL stays down under
a table; going prone probes the body's axis (`FUN_0054d620`, 11.2 and 8.0 at step_height x 0.5 = 3.25) and water <= 2.
The prone crawl has no ceiling test. The walk's crouch-run already runs the 19 ray (`walk.ts`); the stance change's
refusal is not modelled here (it is the stance's, the MOTION workstream's).

### 6.1 The dive (round 3) [read]

`dive_to_prone` (`DAT_003def08`, 495336; `seal_dive2prone`, 1.6 s, BlendTime 0.2, NoInterrupt, `dive_prone` at 0.45).
**Its button is the stance button's full press**: Triangle's pressure past 0.3 (`FUN_00594cf0` 453331-453390) from a
stand or a crouch dives when `FUN_00584b00` (443977-444010) passes -- not already diving, in water no deeper than 2, no
weapon swap, the body moving at **30 a second or more** (root speed^2 >= 900), the play interruptible -- else it goes
prone (a light press toggles crouch on release). `FUN_0057e540` (440870-440920): the world velocity kept (`+0x1350`),
a 0.2 s hold, airborne; the clip's own root travel zeroed (416510-416514); the position by the kept velocity, bled at
**150 a second each second** on the ground (416527-416545); a virtual root falling at 235 to the prone's 2.2
(`FUN_0059b870` 456585-456600); the play ends grounded at rest (418158-418167) -- about 0.9 s and 45 units from a full
run [derived]. The viewer's stance buttons reach it through `WalkMode.setStance('prone')` (C from a crouch, the pad's
Triangle held -- the viewer's stand-in for the full press).

**DIVE-ROOT (B201, 2026-11-03; reading, pending review).** Two corrections to the paragraph above, against r0004's
DIVE-CHECK capture (seat ac, 2026-11-03, 24 runs: `agent-mail/evidence/eph-hunt-2026-11-01/dive-check/RESULTS.md`), where
the port's body sat about 4 u low from 600 to 1000 ms, dived 1-4 u short and came to rest 30-100 ms early:

- **The "virtual root" is a hidden timer, not the drawn root.** `+0xfac` is seeded from the stance's root
  (`FUN_0057e540` D:L440911) and lowered by `+0x133c` x dt to a clamp at 2.2, where bit 0x20 of `+0x105e` clears and the
  bleed starts (`FUN_0059b870` D:L456585-456603). Nothing in the dive writes the root node (`FUN_0059afd0`
  D:L456346-456352; `FUN_0057a330` D:L439149), so the body draws `seal_dive2prone`'s own root: 16 keys, a one-shot of
  1.6 x (15/16)^2 = 1.406 s, its root y off `MOTION_P.ZAR` 9.76, 9.22, 8.50, 7.83, 7.00, 6.51, 6.14, 6.08, 5.20, 4.44,
  3.67, 2.44, 2.19, 2.11, 2.10, 2.13. *Was:* the port forced the drawn root to the timer (`pose().rootY`), at 2.2 by
  600 ms. Built: `Traversal.pose` hands the root to the clip (null) and `Traversal.rootY` -- the camera's and the shot's
  seam -- is the clip's root at the drawn key, cross-faded as the animator draws it (F2, below).
- **The timer falls at 98.1 on the ground, not 235.** At the hold's end `FUN_005af930` resets `+0x133c` to `+0x1364`
  (0 from the dive's start, D:L440907; the reset D:L466797-466802), and `FUN_0059b440` adds one airborne frame of the
  table's 235 (D:L456496), the dive still airborne (`+0x1061` bit 0x2, D:L440909): `DIVE_ROOT_SEED_READING`, 235 x
  525/15734 = 7.84. Once `FUN_0059ad30` lands it (D:L456314-456322), `FUN_0059b440`'s dive branch sets `+0x133c` to the
  frame's start value plus dt x **98.100006**, a literal (D:L456552-456557; the table's 235 added at D:L456496 is thrown
  away): `DIVE_ROOT_FALL_READING`. **Superseded reading:** "falling at 235" (the paragraph above; `SEAL_TUNING.gravity`,
  `dynamics.rdr`'s gravity, `DAT_0044c250`) holds only for the one airborne frame. From the standing root 11.484 the
  timer is down at 0.2 + 0.362 = **0.562 s** (*was* 0.48 s); at rest at 0.562 + v0 / 150, after v0 x 0.562 + v0^2 / 300.
  At the original's press speeds on DIVE-CHECK's runs (its feet over the first 150 ms: about 40 forward, about 34
  backward) that is 27.8 u at 833 ms and 23.0 u at 800 ms, inside the capture's 24.7-28.8 u / 20.0-24.4 u and 754-840 ms.
- **The bleed** (150 a second, once bit 0x20 is clear, `FUN_0054d9a0` D:L416524-416547) is unchanged. The original moves
  the body by `+0x1350` before it bleeds it (D:L416529, then D:L416541-416547), a half step's travel more than the
  continuous total at 30 Hz; the page integrates each phase of a step exactly (R8: the dive is no trajectory; the
  per-second totals), so 30, 60 and 144 Hz steps travel the same.
- **The crouch dive is the standing dive**: a full-stick crouch runs on the standing body (`Walker.posture` stand), so
  the timer starts at the standing root; DIVE-CHECK found the same on the original.
- **r0004.** The twins of `FUN_0059b440` (0x5a0f60), `FUN_0059b870` (0x5a1390), `FUN_0057e540` (0x5838a0) and the
  hold's lines of `FUN_005af930` (0x5b5660) differ from r0001 only by the actor's fields moved 4 bytes (98.100006, 2.2,
  0.2 and the order kept); `FUN_0059ad30`'s one constant change (5.0 to 3.5) is its step margin, not the dive's
  landing (the r0004 investigation's `fundiff.py`, 2026-11-03).
- **The seam follows the drawn body** (the review's F2, 2026-11-03). `Traversal.rootY` feeds the room's hit volumes
  and shot cone and the bots' aim (`moveRoot`), so it is the root the animator draws, not the clip's key alone: the
  clip's root cross-faded in over its `BlendTime` (0.2) with the animator's weight (`blendWeight`, its first frame at
  0), and at rest faded out into the prone base's root over `seal_prone`'s (none in `motion.rdr`: 0.4) from the root
  drawn last -- one frame late, as the animator plays the press's ground word for a frame before the prone base
  (`diveEnd`). *Was* (6db987bba): the clip's key from the press, 0.81 u off the drawn body in the blend-in, and the
  stance's 2.17 at rest while the body was drawn at 4.66, a 2.49 u gap closing by 1250 ms. The one difference left is
  where the blend-in starts: the animator from the run's posed root (10.30 on the fixture's run), the seam from the
  stance's 11.484, which is what the seam has always held for a runner (the room has no posed root); it fades out by
  200 ms. From 200 to 1300 ms the seam is the drawn root within 0.02 (`traversal.test.ts`).
  **The second review (c2f569ce0):** the play the animator draws at rest is not always the prone base. With the stick
  held through the rest it is the crawl's (`loco:prone:<cls>`; the crawl's and the strafes' `BlendTime`, none: 0.4),
  turning it is the turn's (`turn:prone`, `seal_prone_turn`'s 0.9). The end blend now reads that play each tick as
  `Animator.wanted` picks it for a prone body with no action (`diveEndPlay`): a new play restarts the fade from the root
  drawn at the last tick's end over its clip's `BlendTime`, a stick snap over `STICK_SNAP_BLEND`, and it ends when the
  body leaves the prone ground plays. *Was* (c2f569ce0): `seal_prone`'s 0.4 always, so a turn's 0.9 fade ran ahead
  of the drawn body. The seam fades to the stance's prone root 2.168; the drawn body to the play's own (the crawl's
  2.289, the turn's 2.266, the strafes' 1.602 and 1.863), the difference every prone body crawling or turning has with
  or without a dive (LATER 661).
  **The third review (ebd0a74c7):** the turn is the walker's turn rate (`Walker.turn` not 0), the value the animator
  chooses `turn:prone` on (`MoverSnapshot.turnRate`, `Animator.wanted`). The room has it: `MoverSim` sets
  `w.turn = looked.turn` before the tick, the look gate's 4-tick average it also sends the others; the page sets it
  from the look before the tick (`WalkMode`). *Was* (ebd0a74c7): the yaw's change, which in the room left the turn 3-4
  ticks before the drawn body did (0.62-0.74 u) and on the page took a raw-angle mouse turn (turn rate 0) for a turn
  (1.53 u). And the play is settled at one fixed point, the next tick's start, a read of `rootY` changing nothing: *was*
  the first read after the tick, so a read after a stance change between ticks gave another value than reads every
  tick (`traversal.test.ts`: the seam on the animator's clock to 1e-4 for the idle, a crawl, a turn, the room's turn
  tail and a turn with no rate; the same values read every tick or now and then).
- **The carried speed is the speed at the press** (the review's F1, read 2026-11-03; reading, pending review).
  `FUN_0057e540` copies the velocity as it is (`+0x38`..`+0x40` to `+0x1350`, D:L440899-440901), with no cut and no
  wait for a slowdown: `FUN_00594cf0` runs it on the frame the pressure's peak passes 0.3 (D:L453336-453341,
  D:L453380-453390). DIVE-CHECK's forward runs did reach the full run's 65; their speed fell to about 40 a frame or two
  before the dive (`pcsx2.csv`'s `velX`/`velZ`, then `diveVel`) because the run had reached the strip's rise at x
  992-997, floor normal y 0.75-0.80, where the ground driver's `FUN_005b56c0` (from `FUN_00586570` D:L444865) scaled
  the stick to 0.59-0.64 (`stickForward`): the slope's, not the dive's -- the page did the same (its stick scale).
  The one run that dived before the rise (move stand-fwd t3, at x 990.4) carried 65.1 and slid 49.95 u, but it crossed
  the 0.754 slope during the dive (y -148.3 to -135.5, peaking at 97.7 u/s), so its agreement with this model's flat
  50.6 at 65 is a coincidence, not a flat-ground match (the second review). F1 stands on `FUN_0057e540`'s copy and the
  slope's stick scale; `FUN_0057e540`'s r0004 twin moves only the fields (above).
- **Open** (named in the code, section 7.2): `DIVE_ROOT_SEED_READING`'s frame -- the order of `FUN_005af930`
  (D:L466809), `FUN_005b0420`'s landing (D:L467105) and `FUN_0057a330`'s timer (D:L439149) inside one frame, and whether
  the hold runs 6 or 7 frames -- and `DIVE_END_BLEND_READING`, the blend from the dive's play to the prone base after
  the pop at rest (D:L418158-418163), left to the animator's own end, which the seam follows. Against the capture
  (the review's F3): the drawn root at 800 ms is 4.79 against 4.92-5.35, inside only through the test's 0.3 margin,
  and the test holds 1000 ms loosely at 2.6-4.6 (drawn 3.96 against 3.22-3.97); the seam is the same at both since F2.
  LATER 661: the seam's prone root (the stance's 2.168) against the prone plays' own roots, for every prone body.

### 6.2 What else the game has [read]

The steep-ground **slide** (`DAT_003dead8` "Slide", `FUN_0054edf0` 417032-417205, surface test `FUN_0054f330`): a
3-bit field of the ground polygon's surface word bits 28-30 (inside reCOM's `m_reserved`, not decoded by the viewer's
reader) and the slope -- steeper than 50 degrees slides; speed along the fall line gaining `(1 - n_y) x 235` a second;
the clip past 58.75 a second. The entry speed is `n_y · (v_h · ĥ)` (`FUN_0054edf0` D:L417112-417153). A downhill slide a wall
pins, so the resolved y stays in [0, 0.01), clears that speed (`FUN_005483d0` D:L413912-413917). **Built from research
201 §3** (reading, pending review) in `steepSlide.ts`, run by `Walker` on every body tick except `Climb over`, so the
room and the page share one step. The exit landing is `FUN_005af590` and does not write the 0.4 s jump lock. The disc census there is kind 4 on every collision polygon, so the
walker passes kind 4 and does not decode bits 28-30. How `FUN_002dbfb0`'s two points are measured is
`SLIDE_SPAN_MEASURE_READING` (section 7.2). `seal_slide` is flagged, not pushed onto the action stack. A capture is
still owed (research 201 §3). The place to see it is M71 `hallway_blocked` / `di_good` (research 313: about 54°,
normal y 0.589). No prone roll, no mantle beyond the climbs, no rappel, zipline or swim exist.

### 6.3 The jump up a slope: the floor in the air (round 4, 2026-09-29) [read, data]

**The owner's report** (2026-09-29, after playing): a jump while running up terrain went through the ground most of the
time. **Reproduced** (`test/walk.test.ts`, "a running jump up a slope"): ramps of 15, 26.6, 40 and 48 degrees over a
floor running on under them, a take-off on the flat just short of a ramp's foot, Frostfire's rail ramp `rmp1` (x
680-705, z 891 -> 975, y 100 -> 142, 26.6 degrees, the 100 floor under it) and MP6's hillside `g157` at z 1700 (x 1010
-> 1040, y 36 -> 59, about 39 degrees). Before the fix every one ended with the feet under the slope's top -- by 0.8 to
46 units; on `rmp1` the SEAL landed on the 100 floor *under* the ramp, 27.6 under its top.

**The cause** [viewer]: the airborne tick (`Walker.fall`) looked for its landing only among the floors **at or under
the feet as they were the tick before** (`h.y <= from`), and only while falling (`vy <= 0`). A running jump's feet sink
0.98 through the 0.1 s wind-up (research 80 section 2.2) while the run carries them 6.5 units up the slope, so at the
impulse they are already under the slope; from then on the slope was never a candidate: rising, nothing was tested;
falling, the only floors "under the feet" were a floor beneath the ramp (Frostfire: landed there) or none (the fall
went on under the map). The flat-ground tests never saw it: there the floor stays under the feet. `airStep` added a
second fault: a column whose floor was over the feet was refused, stalling the flight against a rising slope.

**What the game does** [read]:

- `FUN_005b0420` (decomp 467037-467110) probes the ground every tick, airborne or not, and takes the floor with
  `FUN_005b5d40` (470163-470290): the highest hit at or under the probe's origin + 1, else the lowest, refused only
  when it is more than 20 over the feet -- the walk's own `selectFloor` (research 23 section 1.1, research 24 section 2).
  The origin is the actor's record `+0xf54` plus a node's world position, written by `FUN_005b0840` (467165-467300);
  the viewer keeps research 23's reading of it, the feet + 5.5 since 2026-10-02 (`STEP_PROBE_LIFT_READING`, section 6.5;
  the feet + 5, `PROBE_LIFT`, before) -- one origin per tick, so the grounded and the airborne picks share it.
- `FUN_0059ad30` (456263-456327) with that floor: with the jump's bit (`actor+0x1061` bit 1) set and bit 2 clear, the
  feet (`actor+0x2e4`) **under the floor** and the wind-up spent (`actor+0x1360 <= 0`), the feet are **put on the
  floor**, bit 1 cleared and bit 2 set. **The fall speed is not touched**: no test of its sign.
- `FUN_0059b440` (456467-456570), the walk-off branch the jump is now in: with the feet at or under the floor, the fall
  speed `actor+0x133c` is recorded and zeroed **only when it is a fall** (`0 <= +0x133c`), and the feet put on the floor
  (plus the material's offset); the airborne bit 5 is cleared -- the landing, `FUN_005af930` -> `FUN_005af590` -- only
  when the feet are within 3 (`DAT_0044c264`) of the floor **and falling**.

So in the game a slope rising over a jump's feet lifts them onto it and the rise goes on; the landing is on the way
down. **The fix** (`walk.ts` `fall`, `airStep`): the airborne floor is `selectFloor(probeGround(x, z), from + 5.5, y)`,
the ground's own pick; feet at or under it are put on it; a fall (`vy <= 0`) is the landing, a rise goes on. A column is
entered in the air when that same pick finds a floor there -- `selectFloor(probeGround(x, z), y + STEP_PROBE_LIFT_READING, y)`, up to
20 over the feet (`FUN_005b5d40` 470163-470290) -- and the tick's floor then puts the feet on it (`FUN_0059ad30`
456313-456322, `FUN_0059b440`). No floor (the map's edge, a hole, a top more than 20 over the feet) is the probe's miss:
`FUN_005b0420` (467057, 467098) with `DAT_003df1c8` set (1 in the ELF) puts the actor back at its last hit
(`FUN_003157d0`), so the sub-step is not taken (`mover.ts` `airStep`). This replaced, 2026-09-29 (OWNER-5, launch fix
B10), the viewer's former allowance -- a column entered only with a floor within `step_height` (6.5) over the feet, a
rule no function gave -- which stopped a jump dead at a wall-less ledge 7-20 high. Pinned by `test/walk.test.ts`: a
12-high wall-less ledge is entered, its cut far side taken at 12 and refused at 25, and the map's edge pins the jump.
The flat jump, the walk-off and every landing test are unchanged (the flat floor is never over the feet in flight).

**Bounds** [derived]: with `FUN_005b56c0`'s uphill factor on the stick (section 5.3) the run up a slope of angle a is
`65 cos^2 a`, so the feet end the wind-up at most `0.98 + 65 cos^2 a x 7/60 x tan a <= 0.98 + 3.79` = 4.8 under the
slope's top -- inside the pick's 6, so the slope is always the floor chosen, even over a floor beneath. Without the
factor (a bare `Walker`) a ramp over 33.5 degrees over another floor can sink the feet past 6, and the game's pick then
takes the floor beneath as well; the tests of the steep ramps run with the traversal's driver, as the page does.
Terrain without a floor beneath takes the slope as "the lowest" up to 20 under it. **Not modelled**: the game's two-tick
landing (`FUN_0059ad30` puts the feet on the floor, the next `FUN_0059b440` zeroes the fall and clears bit 5) and the
3-unit landing window -- the viewer lands on the tick of contact, as before.

### 6.4 The prone press in water: issue #22 (round 5, 2026-09-29) [read, data]

**The report** (research 90 section 9.4, #22): at spawn A of Enowapi (MP62), Shadow Falls (MP64) and Fish Hook (MP71),
holding `C` gave crouch, not prone; `setStance('prone')` would not take; the SEAL crept ~15 units over the 6 s of
the tap-hold-tap-tap run with no stick.

**Not the slope** [data, `test/traversal.test.ts`, the served tree's maps]: the three spawns stand on the bed of water
5.3, 3.8 and 4.3 deep (Enowapi's water at y -14.17 over the feet at -19.49), on ground 3.5, 20 and 1 degrees off
flat. Nothing in the game refuses prone by slope: the stance functions below read the water, and the only slope gate
on the SEAL's actions is the jump's (`FUN_0057e1b0`, decomp 440799, `actor+0x1348` against `max_slope`). The walk
does not slide on a slope either; at rest the mover at each spawn holds its feet bit for bit.

**What the game does** [read]: the stance request `actor+0x374` goes through `FUN_00552d60` (decomp 418866-418900):
prone to the dive test (`FUN_00584b00`) and else `FUN_00581660`; crouch to `FUN_00581990`. `FUN_00581660` (442436)
with the in-water bit (`+0x105e` bit 7) and the depth `+0xf88` over **2.0** does not go prone: it **rewrites the
request to crouch** (`+0x374 = 1`) and calls `FUN_00581990` instead; that one, over **8.5**, rewrites it to stand
(`+0x374 = 0`) and calls `FUN_00581c10`. So the game **substitutes** -- a prone press 2-8.5 deep is a crouch press
(from stand the stand-to-crouch clip; already crouched, nothing), and deeper a stand. The viewer's crouch at those
spawns is the game's answer; tap-hold-tap-tap there is crouch > crouch > stand > crouch, and a prone reading needs
water no deeper than 2.

**The viewer's defect, and the creep** [viewer]: `Walker.changeStance` took the prone request as asked -- the stance
prone and the `Crouch -> Prone` (or `Stand -> Prone`) clip started, its root motion (`FUN_0028c250`, round 3) carrying
the body ~8 units -- and only the next tick's water rule (`Traversal.water`, `FUN_005b56c0`'s stand-up) put the stance
back to crouch, the clip still playing out. That clip's travel is the "creep"; the stand/crouch clips of the taps move
the feet ~1.7 out and back. **The fix**: the seam `TickDriver.stanceFor` (`Traversal.stanceFor`, the water over the
feet where they stand) rewrites the press as `FUN_00581660` / `FUN_00581990` do before `changeStance` starts any clip,
for the page and the server's `MoverSim` alike (both call `changeStance`); `WalkMode.setStance` reads the stance back.
The pad's Triangle and `C` need nothing of their own. `tools/release-sweep.ts`'s want of crouch > prone > crouch >
stand holds only at a spawn in water 2 deep or less.

### 6.5 The kerb over a lower floor: the grounded step's probe origin (2026-10-02) [read, reading]

**The gap** (research 101 A7): the grounded step took `selectFloor` from the feet + `PROBE_LIFT` 5, so its window
(+ `SELECT_ABOVE` 1) ended at the feet + 6; a kerb 6 to 6.5 over the feet, with a lower floor also under the line, was
walked under for the floor below though `step_height` is 6.5. Chris's browser-beta-v5 (`chris/browser-beta-integration`
d578f347, `mover.ts` `step()`) lifted the step's origin to `step_height - SELECT_ABOVE` = 5.5 and called it a browser
consistency correction.

**What the game has** [read]: `FUN_005b5d40` keeps the highest candidate at or under the origin + 1 (socom_pc research
23 section 1.1 item 9); the origin's y is the actor's plus a bone's translation rotated by the actor matrix (research 23
section 1.2), so it moves with the pose: +5.5 in the PCSX2 spawn image, +4.7 in the recomp's, +11.2 at the skeleton
root. The game compares no floor rise with `step_height` in the walk: `step_height` (`DAT_0044c26c`, `dynamics.rdr`
+0x1c) lifts both ends of a segment query the move solver makes in its contact branch, from the actor's position
ahead along the velocity by its length plus the speed along it (at least 5.25, 10.5 standing, or 11.46;
D:L413686-413711; corrected 2026-10-09 by #111's review: this note said it ended at the moved position) (`FUN_005483d0` D:L413711-413731; the query `FUN_0031e1d0` D:L220125, the world record `+0x14c`), and a polygon that line meets steeper than `max_slope` (`+0x14 <= DAT_0044c268`, D:L413736) and not
VOLUMETRIC or LIQUID stops the move -- a face under 6.5 is not met. The face a body meets first is the wall
probes' at `step_height` (`FUN_0054aa30` D:L415167; research 217 section 2.1), the port's low probe line.

**The reading**: the grounded step's origin is the feet + 5.5 (`STEP_PROBE_LIFT_READING`, `mover.ts`), the console's
spawn measurement, which is also where his derivation landed. The origin is one per tick -- `FUN_005b0840` computes it
once and `FUN_005b5d40` selects with it, airborne or not (socom_pc research 23 sections 1.1-1.2) -- so the spawn
(`Walker.place` from `walk.ts` `respawn` and the room's spawn, PL-2), the fall and the airborne column (section 6.3)
take it too (a review finding of 2026-10-02: with the step alone at 5.5, a spawn or a landing in the 6-6.5 band picked
the lower floor and the first walking tick lifted the feet 6 to 6.5). `probeFloor` (a material or normal lookup) and
the AI maps keep `PROBE_LIFT` 5. Held by `walk.test.ts` (6, 6.25 and 6.5 kerbs over a lower floor at bases 0 and 40
stepped onto; a 7 surface walked under; a respawn and a rise under a 6.25 kerb stand on it) and `room.test.ts` (PL-2: a
top 6.25 over the record lifted a unit is the spawn's floor). Not settled: the origin while running (the bone's translation in the run's
pose), and the crouched and prone origins. W2.2c settles it: on PCSX2, walk a SEAL at a 6.25 kerb over a lower floor.

## 7. What the viewer does, the seams, the bindings, the events

### 7.1 Modelled

The ladder (contact mount at the foot and the head, the climb at 13.5 (research 206 section 2.4), the rungs, the head ray, the foot, the slide at
0.8 g and its landing), the climb (appflags, contact, table, facing, action press, the automatic step up, the steer,
the clip's path, the hang and pull-up, the jump-grab), the peek (d-pad/Q/E held, still, side ray, stance clips,
camera ease, third- and first-person shifts, the pass's surface mode, no locomotion), the wade (water no floor,
depth, the factor, the stances). Tests: `test/traversal.test.ts` (18, synthetic hulls and Frostfire's), `clipPath.test.ts`
(2), `e2e/traversal.spec.ts` (Frostfire's ladder, crate and peek, with pictures).

### 7.2 Placeholders and simplifications (named in the code)

Closed in round 3: the crate/medium blend (both nodes, the game's weights), the "180" (by code, 0.883 s), "Hang jump
down" (the push, then the fall), the slide from the head, `FUN_0054e430`'s ray, the material's foot offset, the uphill
factor, the ripples and the splash, the lean's toss, the dive. Left: the climb-off's reversal on meeting another
character (the viewer has none); the ripples' `actor+0xe1` bit 4 (taken as set);
the Triangle's pressure (a hold stands in for the full press); the ladder's 13.5 is derived (research 206 section 2.4; the PINE capture owed); the
fallback clip shapes (a smoothstep with each clip's seconds, rise and travel) stand in only before the pack arrives.

Named in the code:

| name | value | stands for | status |
|---|---|---|---|
| `DEATH_LANDING_GETUP_PLACEHOLDER` (`mover.ts`) | true | a deadly fall's `Land forward` getting up (`Get up forward`) in the free walk (`&nomatch`, `&fly`), where nothing kills; the game dies in that landing (`FUN_005af590` 466641-466728, state 8, vtable +0x90) and never gets up (`FUN_005979a0` 454470-454495 spectates or fades the body; research 80 section 6c) | open, the free walk alone: in a match -- online, or the offline match run in the page (research 91 section 20) -- the net client's `kill` sets `Walker.dead`, which holds `Land forward` (or a knock's `Land backwards`) at its last key. A blast knock's landing always gets up, as the game's own (`knockLanding_`, L446653-446700) |
| `LANDING_HIT_DRAW_READING` (`mover.ts`) | `landingHitDraw(seq)`: Knuth's multiplicative hash of the command's `seq` over 2^32 | the heavy landing's coin between `Hit stomach` (at or under 0.5) and `Hit` (`FUN_005af590` 466667-466669, `FUN_00197740`): the game draws from its own generator on one machine; the page's prediction and the match server must land one clip (a 23-unit root-travel apart otherwise, review 2 M-2), so the draw comes from the command both hold (`Walker.commandSeq`, set by `MoverSim.prepare` and by the page's walk, which numbers its ticks as the net client does, pinned by `walk.test.ts`); the coin is for a live mover: a corpse (`Walker.dead`) lands `Hit` on both ends, since its ticks carry no command (`Room.corpse`, the page's locked walk) and no seq is shared (review 3, A2) | open, a reading of the draw's source; the rule (a fair coin, the two clips) is the game's |
| `PEEK_CUTS_ACTION_READING` (`traversal.ts`) | true | a peek started over an action that gives way (`FUN_00587c20`) ends that action as the stick's cut does (a get-up standing the SEAL): `FUN_0057d810` (440451-440530) pushes the lean over it, and whether the action is popped or left beneath is not read; the mover has one action slot | open (section 4.1) |
| `PEEK_HOLD_CONTINUES_READING` (`traversal.ts`) | true | a peek already held goes on through the kit's one-shot: `FUN_005b4340` skips `FUN_00587c20` in state 3 (469345) and the lean's toss is thrown from the peek (section 4.4), both read; whether a crouched or prone still reload (`FUN_005a82e0` 462786-462930) started mid-peek is refused, pushed over the lean or ends the peek is not read, and the web lets it run under the held peek as the toss does (review 3, A1) | open (section 4.1) |
| `PEEK_STANCE_ENDS_PEEK_READING` (`traversal.ts`) | true | a stance press while peeking ends the peek and its transition plays as for a SEAL not peeking: the presses pop the stack, the lean with it (prone 442452-442467, crouch 442559-442575, stand 442582-442598), and each pop writes `actor+0x174` from the entry left on top (135104), so `state == 3 ||` (469345) no longer holds -- read; the stance functions are handed the state taken before the pop (3), for which `FUN_005817d0`, `FUN_00581c10` and `FUN_00581540` have no case, so whether the game plays a transition clip and which stance it leaves is not read; the web takes any action on the mover under a held peek as leaving state 3 (review 4) | open (section 4.1) |
| `CROUCH_TOP_READING` (`mover.ts`, `STANCE.crouch.bodyHigh`) | 14 | the crouched body's column top: the standing top 20 x 0.7, the height a crouch keeps, over `min_stand_height` 10 (`dynamics.rdr`, x10; `char_dyn.cpp:421-422` names it, nothing reads it) | retired 2026-10-05 (web sprint 28, PF-16): no column -- the walls meet the size class's probe at the feet + 6.5, r 3.5, and the head line at the idle head + 2 (`WALL_PROBE_READING`, `wallProbeHeights`; `FUN_0054aa30`, research 217 §2) |
| `PRONE_ROOT_READING` (`mover.ts`, `STANCE.prone.rootY`) | 1.8 | the prone skeleton root over the feet: under the ramp's floor 2.169155 (where the camera stops lowering -- the lowest stance is the one the floor was cut for) and about a body's half-thickness, 0.18 m | retired 2026-10-05 (web sprint 28, PF-21): `seal_prone`'s `skel_root`, 2.1680 = 555/256 (`PRONE_ROOT`; research 180 §1.2, research 217 §4) |
| `PRONE_TOP_READING` (`mover.ts`, `STANCE.prone.bodyHigh`) | 9 | the prone body's column top: a body lying down is about 0.9 m high with the head and rifle up; the foot stays at 6, the step's band. The original has no column: its prone probe is a fan of segments along the travel (`FUN_0054aa30`, D:L415150-415240; research 180 §1.6), owed to PF-16. PF-05's first fix round read class 2 as a radius-8 disc at the feet + 3 -- a misreading (it froze a prone SEAL in any gap under 16), taken out in its third | retired 2026-10-05 (web sprint 28, PF-16): no column -- prone the probe at the feet + 3.0, 8.0 ahead along the travel and 3.12 across (`WALL_PROBE_READING`, `PRONE_FAN_READING`; `FUN_0054aa30` D:L415582-415621, research 217 §2) |
| `PRONE_PROBE_HEIGHT_READING` (`mover.ts`) | 3 | PF-05's first fix round: one prone probe at the feet + 3 with a radius-8 disc (`PRONE_BODY_RADIUS`), read from `FUN_0054aa30` class 2 | removed 2026-10-04 (PF-05's third round): a misreading -- class 2's 8.0 sizes a fan of segments along the travel (D:L415150-415240), not a disc; the fan is PF-16's |
| `PRONE_GATE_READING` (`mover.ts`, `Walker.proneRefused`) | 11.2 ahead, 8.0 behind, at the feet + 0.5 x step_height (3.25) | `FUN_00552ec0`'s prone gate (D:L418935-418940) through `FUN_0054d620` (D:L416194-416363): two segments, an obstacle on either refuses prone from stand or crouch; brought forward from PF-15 by PF-05's second fix round (research 180 §4.2) | **8.0 behind: proven** (2026-11-03) by ac's capture at M51's fence `worldmodel/noreg_343344/g15582` (PCSX2 r0004, 3 trials each, all identical, 2026-11-03T02:56-03:03Z; `agent-mail/evidence/eph-hunt-2026-11-01/segment-body/results/SEGMENT-BODY.md`, "02:56-03:03Z" (a)): standing facing away, the press refused at 7.00 / 7.50 / 7.75 u from the plane and taken at 8.00 / 8.25 / 8.50 u, the limit between 7.75 and 8.00; held by `segmentBody.test.ts` "M51's fence g15582" (a), a dev-disc test (no harness spec or golden trace yet); a capture of one thin fence, level ground. **11.2 ahead and the 3.25 height: a reading** (neither varied by the capture): the segments' turn by the rotation from up to `actor+0x410` (`FUN_00306d40`) taken as none, level; `FUN_005ab590`'s material filter not transcribed (the mover's walls); research 217 §2.9 |
| `STEP_PROBE_LIFT_READING` (`mover.ts`) | 5.5 | the mover's probe origin over the feet, every tick and the spawn: research 23 section 1.2's PCSX2 spawn image (+5.5; the origin is pose-dependent, +4.7 / +11.2 elsewhere), so the pick's window reaches `step_height` 6.5 (section 6.5; ported from Chris's browser-beta-v5) | open, a reading; W2.2c measures (a 6.25 kerb over a lower floor on PCSX2: walked at, spawned on, landed on) |
| `SLIDE_SPAN_MEASURE_READING` (`steepSlide.ts`) | `'column'` | how `FUN_0054f330` reads the polygon's top − bottom. Research 201 §3 leaves `FUN_002dbfb0`'s two points interpretive and reads them as top and bottom the way `climb.ts` `columnTop` does: the highest and lowest edge point whose xz-projection contains the feet, or null when none does (a failed extent read slides). On a planar quad under the feet that span is the polygon's full height, so a 3-tall face does not slide a standing body and does slide a prone one (the note's test). `'vertices'` is max y − min y of the polygon, ignoring where the feet are | open, a reading; the capture owed in research 201 §3 |
| `HEADROOM_FROM_READING` (`mover.ts`) | 14 | the foot of `FUN_0057efe0(actor, 0)`'s headroom ray: the game casts from a skeleton node (`actor+0x304`) + 2 (decomp 441218) to the feet + 19 (441214); the node's height is not in hand, so the ray starts at the crouch column's top | retired 2026-10-05 (web sprint 28, PF-15): the node is the hips (`actor+0x304`, D:L419618-419619), the foot the stance's idle hips + 2 on both ends (`HEADROOM_HIPS_READING`, research 217 §1.2) |
| `LADDER_STICK_INTO_READING` (`traversal.ts`) | `'pushing into the face'` | the ladder mount's stick test (a wish pushing into the contact's face, `(wish . n) <= -0.02`), which `FUN_005b4b40` (D:L469562-469676) does not have; kept so a contact held up to 24 (`FUN_005b3890`) does not snap on a SEAL who brushed the rungs and backed off facing them (section 2.5) | open, a reading; a capture of brushing a ladder and backing off |
| `LADDER_STILL_CAST_ACTORS_READING` (`traversal.ts`) | `'every actor'` | `ladderHits`' still cast along the facing runs for every actor, room bots and remotes included; the original casts for the local player only (D:L415036-415055: vtable +0x30, bit 0 of +0x268 under the 0x44d4d0 flag) (section 2.5) | open, a reading |
| `LADDER_MATCH_READING` (`traversal.ts`) | 1 | `ladderOf`'s match of a contact to its ladder record: within 1 of the plane, half-width + 1 across; no source (the original reads the contact's polygon, no ladder list); 1 is `findLadders`' `SAME` (section 2.5) | open, the port's own |
| `LADDER_DROP_FLAG_READING` (`traversal.ts`) | `'never set'` | `FUN_005b3890`'s drop of a ladder contact on bit 1 of `seal+0x1061` (D:L469004-469005): what sets the bit is unread (section 2.5) | open, a reading; read the writers of `+0x1061` |
| `WEAPON_LINE_LENGTH_READING` (`weaponLine.ts`) | 59 lengths by `WEAP_GEO` name; the M4A1 SD 22.9303 | the weapon line's length, `FUN_0054e8f0` D:L416892-416902: 2 x the held model's `|bbox x max - x min|` (its `nparams` +0x40 bounds), unless the model's byte +0x5f has bit 6 (0x40) set (D:L416894), when `FUN_00541510` walks the +100 chain (D:L408768 on) -- no weapon model on the disc sets it (the byte is 0x80 or 0xa0; `weaponLine.test.ts` over `WEAP_GEO`'s 59) (s3.8) | open, a reading (the disc's bounds through the repository's readers, Frostfire's and M51's archives alike); **the M4A1 SD's 22.930 proven** (`WEAPON_LINE_M4A1_SD_PROVEN`: ac's RDRAM read on r0004, 2026-11-04 09:16Z, its bounds x -3.679799 to 7.785366, the flag byte 0x80, bit 6 clear), inside the capture's 22.5-23.4 reach |
| `WEAPON_LINE_ONE_SIDED_PLACEHOLDER` (`weaponLine.ts`) | true | whether the weapon line's query `FUN_0031e160` (D:L416642) meets a polygon from its front only; its crossing test is not transcribed, and the port takes the hull's one-sided test as the segment records do (research 281 s4.3); a line starting inside a collider would meet the far side's back face under `false` (s3.8). One-sidedness only: the set of polygons is `WEAPON_LINE_POLYGON_SET_PLACEHOLDER` | open; a read of `FUN_0031e160`'s crossing test, or a capture with the line starting behind a face |
| `WEAPON_LINE_POLYGON_SET_PLACEHOLDER` (`weaponLine.ts`) | `'movement'` | which polygons the weapon line's query `FUN_0031e160` (D:L416642) returns -- whether floors are among them; the function only fills a query on world `+0x14c` (fresh review 1's F3 read), the set that query walks is not transcribed. The port asks the movement's surfaces (bit 1 set, bit 18 clear, as `segmentHit`'s), floors among them, which the line keeps at any slope (D:L416644-416672) -- so it alone decides LATER 682 (the running jump up Frostfire's rail ramp refused); `'walls'` recorded (s3.8) | open; a read of `FUN_0031e160`'s polygon set, or an r0004 capture of a running jump pressed partway up Frostfire's `rmp1` |
| `WEAPON_LINE_ITEM_MODEL_PLACEHOLDER` (`weaponLine.ts`) | `'firearm'` | the weapon line's length with an item up: `FUN_0054e8f0` takes the model of the kit entry the hand byte `+0xf79` picks (D:L416869-416870), so with a grenade up the original's line is the item's (`grenade` 2.5372); the port's mover carries the firearm hand only (`Walker.hand` 0 or 1), the item up held outside it on both sides, and which entry `+0xf79` names in each item state is not read -- the port keeps the firearm's model (fresh review 1's F1; s3.8) | open; a read of `+0xf79`'s writes, then the item's model carried into the mover on the room's and the page's side |
| `WEAPON_LINE_BOTS_PLACEHOLDER` (`weaponLine.ts`) | `'cast'` | whether the port's bots cast the weapon line | replaced 2026-11-04 by `WEAPON_LINE_BOTS_READING` (below), the controller's ruling between readings (6d) |
| `WEAPON_LINE_BOTS_READING` (`weaponLine.ts`, read by `matchBots.ts` `adopt` / `release` / `dispose`, match `room.ts` `newSim` for an AI seat, `climbDiscovery.ts`, `navigation.ts`'s ladder probe, `hostageFollow.ts` and the zombies' `mode.ts` / `obstacle.ts` into `Walker.weaponLineCast`) | `'none'` | the port's bots cast no weapon line: the original casts it only when the body's controller (`actor+0xc0`) answers its vtable +0x2c (D:L416630-416633); `CSealCtrlAi`'s table 0x6693f0 holds `FUN_00575c30` there (the ELF's word at 0x66941c), whose two instructions return 0 (`jr ra`, `v0` = 0 in the delay slot) -- re-read on the disc's `socom2_game.elf` 2026-11-04, as research 334 s9 and 199 s12.5 read it -- where the local player's `CSealCtrl` (0x6694b0) holds 0x5431f0, returning 1; the port's bots are the AI's model (`MoverSim.ai`, `IsAi`). The same on r0004 (OT.R97): the r0004 investigation's function-diff table (`scratch/code-diff/classify.json`) pairs the cast `FUN_0054d9a0` with r0004's 0x552790, 'changed' (raw_diff 97 of 674 words), whose recompiled output (`FUN_00552790_0x552790.cpp`) still loads the controller's vtable +0x2c, calls it and branches on the answer (0x552f74-0x552f8c) before its `+0x1344` read; `FUN_00575c30`'s twin 0x57b010 is 'same' (raw_diff 0; `FUN_0057b010_0x57b010.cpp`: `jr ra`, `v0` = 0). The r0004 `CSealCtrlAi` vtable slot itself is not re-read. The controller's ruling between readings (6d, 2026-11-04, for the owner to see; plan Log). With or without it the bots' 40-tall app-4 climb passes (`botClimbNavigation.test.ts`, the jump reading no contact) (s3.8) | reading, pending review (the vtable word re-read by the implementer; a reviewer's re-read owed); `CRemoteCtrl` (0x5e6250) answers 0 too -- the room's simulation of a remote human casts, as that human's own console does |
| `DIVE_ROOT_FALL_READING` (`traversal.ts`) | 98.100006 | the dive's hidden timer's speed gained a second on the ground: `FUN_0059b440`'s literal (D:L456552-456557), not the table's 235 (section 6.1, DIVE-ROOT) | open, a reading, pending review; a memory trace of `+0x133c` and `+0xfac` through a dive settles it |
| `DIVE_ROOT_SEED_READING` (`traversal.ts`) | 235 x 525/15734 (7.84) | the timer's speed at the hold's end: one airborne frame of gravity (D:L456496, after the reset D:L466797-466802) (section 6.1) | open, a reading, pending review; settled by the frame's order (`FUN_005af930` D:L466809, `FUN_005b0420` D:L467105, `FUN_0057a330` D:L439149) and the hold's 6 or 7 frames, or a memory trace |
| `DIVE_END_BLEND_READING` (`traversal.ts`) | `"the animator's own end"` | the blend from the dive's play to the prone base after the pop at rest (`FUN_00589aa0`, D:L418158-418163), unread (section 6.1); the port's animator cross-fades into its next play -- the prone base's (0.4), a crawl's (0.4) or a turn's (`seal_prone_turn`, 0.9) -- and the seam (`Traversal.rootY`: the room's hit volumes and shot cone, the bots' aim) follows that play's clock (`diveEnd`, `diveEndPlay`; review F2 and the second review) | open, a placeholder; the pop's blend read, or a capture of the root from rest to prone |
| `STANCE_HOLD_S_PLACEHOLDER` (`stanceButton.ts`) | 0.4 s | how long Triangle (the pad) or `C` (the PC) is held before it means prone: the game reads the button's pressure, not a time (a light press toggles crouch at release, a full press goes prone at once; `host_crouch_shortcut.h`, KNOWN R139), and a browser's button is only on or off, so the owner's rule (2026-09-28: tap crouches, hold goes prone) needs a length | open, the owner's to set (handoff section 6) |

Retired: the airborne column's `step_height` allowance (section 6.3; the ground's pick replaced it, OWNER-5).

### 7.3 The seams (re-applied over the MOTION rewrite at the merge of `claude/web-viewer-playtest-fixes`, 3e673174)

- `walk.ts`: `GROUND_FIELDS` 6 (`appflags` packed; `WorldPoly.appflags`); `TickDriver` / `TraversalHooks`
  interfaces; `Walker.driver`, whose `tick` runs first in `Walker.tick` (before the jump lock and the actions),
  returning true when it moved the mover; `Walker.setAirborne(on, vy)`, which also ends the action, the jump and the
  carried velocity (a jump-grab ends the running jump; a hang's let-go starts `Jump fall`); the water's
  `stickFactor` before the air / ground split; `WalkMode.useTraversal`, `traversal()`, `action()`, `lean()`,
  `attachMoves` (where `stand()` makes the `Walker`), the move's yaw held in `look()`, `moves?.reset(w)` in
  `setCamera`, the peek on the camera and the move's root under the posed one in `cameraTick()`, the peek's shift and
  the move's root in `follow()`'s first person, `PlaySnapshot.traversal`; the jump and a stance change refused while
  `busy()`; `stance_` kept with the mover's after the ticks. Every line is marked `TRAVERSAL SEAM`.
- `animator.ts`: `MoverSnapshot.traversal` (`TraversalPose`: clip, frame, loop, rootY); `step` hands it to
  `traversalStep`, a one-node play keyed `trav:<clip>` at the move's key, its `zanim_callback`s fired through `onEvent`
  as the phase passes them, `rootOverride` setting the root's height in `pose()` -- so `rootY()`, and through
  `WalkMode.setPosedRoot` the camera, carry the move's root.
- `playerCamera.ts`: `peekShift`, `localCamera(rootY, pitch, peek = 0)`, `PlayerCamera.peek`,
  `firstPersonPeekShift`, `isPeekCameraSurface` and `cameraPass`'s `accept`.
- Round 3: `TickDriver.stickScale` (the slope and the water per axis) and `Walker.glide(dx, dz)` (the dive's carry);
  `TraversalHooks.jump`, `stanceButton`, `dive`, `peeking`; `WalkMode.setStance('prone')` asks the dive first;
  `PlaySnapshot.peek`; `TraversalPose.holdRootTurn` / `blend` in the animator; `Effects.spawn` (a run's handle);
  `grenade.ts`'s stance takes the peek.
- `gamepad.ts`: the `action` lane on Cross (standard button 0), `leanLeft` / `leanRight` on the d-pad's Left / Right
  (14 / 15), walk-only (`ACTION_WORDS`); `ui.ts`'s walk hint names X, Q / E, Cross and the d-pad.
- `main.ts`: `TraversalPage` (with the audio's `play` / `onLand`), `TRAVERSAL_CLIPS` in the play request, `setClips`
  on the play data, `padLanes(before, after)` in `padFrame`, `input()` before `walk.frame`, `hudFrame(hud)` and
  `hud.feed({ climb: traversal.hudClimb() })`; the hook's `traversal()`, `action()`, `setLean()` (`hook.ts`).

### 7.4 Bindings

| control | the game's | the viewer |
|---|---|---|
| Cross (button 0) | Action (climb, the ladder slide) | the `action` lane, on its press, walking |
| Square | Jump | jump (the owner's layout) |
| d-pad Left / Right (14 / 15), held | peek left / right | the `leanLeft` / `leanRight` lanes, walking |
| keyboard X | (the pad's Cross) | the action, on its press, walking |
| keyboard Q / E, held | (the d-pad) | the peek left / right, walking (the fly camera's down / up) |

### 7.5 The sounds and the events

The traversal's clips play in the animator, so their `motion.rdr` callbacks sound through `Play.onEvent` ->
`WalkSounds` -> `GameAudio.onAnimCallback` like any clip's: `ladder_rung` (CZANIM `ladder_rung`, `.STEP_LADDER` at the
hips; reCOM's SOCOM 1 `sounds.rdr` `SND_STEP_LADDER ONESHOT RANGE(30,200)`), `climb_up` (`.CLIMB_UP`), `pull_up`
(`.PULL_UP`), `jump_whoosh` (`.JUMP_WHOOSH`). The wade's steps and a fall into water are the bed's `UNDERWATER`
material's (`.STEP_WATER`, `.FALL_WATER`) through the footfalls and the landing. `TraversalPage` sends only what no clip
carries: the slide's `~LADDER_SLIDE` (0x65f558, `FUN_00344f30` decomp 461031; the audio plays one pass of the loop)
[corrected 2026-10-14, PAR-89, history kept: `FUN_00344f30` at D:L461031 is the handle's lookup at the map's load, not a
play; the loop is held for the "Ladderslide" action's whole life (`FUN_00550ef0` D:L418407-418422), research 305
section 6] and
the slide's landing (`onLand` at its contact speed). Every `TraversalEvent` also goes out on `window` as
`s2u:traversal`: `ladderMount {from}`, `ladderRung {y}`, `ladderDismount {at}`, `ladderSlide {on}`, `ladderSlideLand
{speed}`, `climbStart {kind}`, `climbUp`, `pullUp`, `jumpWhoosh`, `climbEnd {kind}`, `waterEnter {depth}`, `waterLand
{depth}`, `waterLeave`.

**The HUD** (`./hud`, research 87): the climb prompt as `Hud.feed`'s `climb` (the step up and the vault as `low`: one
bitmap for all), the ladder's `action_slide.tif` through `Hud.setAction('ladder_slide')` while on a ladder.

**The jump** is the walk's (research 80): the standing jump stays on the floor (its rise is the clip's), so a ledge is
climbed from it as from the floor; the running jump's 79.9 up lifts the feet 13.6, bringing a 36 ledge into the table's
32 while the contact holds -- the jump-grab, pinned in `traversal.test.ts` on the walk's own `Walker.jump`.

## 8. The states [read]

`seal+0x174`: 0 stand, 1 crouch, 2 prone, 3 peek, 4 hang, 5 ladder, 6 in air, 7 idle, 8 dead, 9/10 carrying/carried
(the dispatcher decomp 445166-445230; reCOM `zseal.h:58-72`). Entering 8 drops a hang or a ladder: `FUN_005af590`
calls `FUN_005a5da0` on state 8 (466696-466699), the blast's death before it (440992-440993) -- the web's corpse leaves
the move and falls (`walk.ts` `setDead`, the room's `kill`; review 2, M-4). `DAT_003deae8` "Jump" (0x661510) is an anim type, not a
state. The traversal anim types: Jump launch/fall/land/land hard, Step up, Stand -> Hang, Hang, Hang -> Climb, Hang jump
down, Ledge -> Hang backwards, Hop down forward/backwards, Climb crate/medium/over, Stand -> Ladder, Climb ladder, Climb
off ladder, Ladder -> slide, Ladderslide, Ladderslide land, Falling, Land soft/hanging, Fall forward, Get up forward,
Slide, Prone crawl/turn/strafes/cover, the peeks, 180. No roll, mantle beyond the climbs, rappel, zipline or swim.
