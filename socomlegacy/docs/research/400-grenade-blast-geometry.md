# 400 -- Grenades through walls on Desert Glory and Frostfire: a geometry census of the blast's lines (draft)

- Date: 2026-11-11. Task NADE-BLAST (the owner's reports of 2026-11-11: players see grenades go off through walls, mostly
  on DESERT GLORY (MP6) and also on FROSTFIRE (MP2); the owner: "it does make me question some collision on certain
  object types being off maybe"). Branch `agent/nade-blast-reading` (base efd58e3064).
- Track: **simulation** (it measures what the game does), but **no behaviour changes here**: a dev-disc census of the
  port and this draft. The fix it sizes waits for its own task and review.
- Evidence kind: **dev-disc measurement of the port**, headless (`packages/match/test/blastGeometryCensus.devdisc.test.ts`;
  it skips without the disc). It uses the room's own map (`roomOn`: `loadSimMap`, r0004's G1 edits, the room's opening
  world state) and the room's own blast predicates (`blastExposed`, `roundAdmits`, `reachGate`). No capture of the
  original was taken, no browser was run, nothing here is proven.
- The original's side comes from the NADE-BLAST readings (`agent-mail/evidence/nade-blast/`, 04-synthesis and the
  skeptic's 06, PASS WITH FINDINGS). They are **reading, pending review**, and this note re-reads none of them:
  - **Line 1**: the explosion's own check, `FUN_003c7dd0` -> `FUN_003c80e0` (D:L318974-318992, D:L319096-319143). It
    runs to the midpoint of one of the body's node boxes (which node is unread: capture C1) and is judged by the
    PENETRATION product.
  - **Line 2**: the body's own line to the head bone, `FUN_005ac070` -> `FUN_005a0e70`, through the r0004 see-through
    set (research 388).
  - **Both lines are one-sided** by research 281 s4.3's reading of mode 0x20, which nobody has re-read here.
- The port checks line 2 only, to `HEAD_OVER`. Its last two changes to that line:
  - v0.4.15 07386ff045 made it one-sided;
  - v0.4.18 a27aa6298f made it see through INVISIBLE_DI, METAL_GRATE, PERSON and LIQUID.

## 1. What was measured

**Maps.** MP6 and MP2 (the reports), against MP51 and MP72 (no reports).

**Part 1: every collision face, by object type.** The type is a name rule on the owner's path (`TYPES` in the test).
It is a census key, not a reading. For each type:
- **(a) one-faced**: an admitted wall face (`roundAdmits`, |n_y| < 0.7) with no admitted face met front-first in the
  10 u behind its centroid. Also counted: how many of those have a floor and a crouched body's room behind them.
- **(b) unmet**: faces with side bit 1 clear, camera-only faces, and faces on owners the query gate refuses.
- **(c) see-through since v0.4.18**: admitted faces of a material line 2 now passes.
- **(d) drawn but not stopped**: drawn, opaque wall triangles (fogged, not alpha-pass, the name rule's alternate states
  left out; the zAnim opening state is **not** applied). Each is probed 4 u either side along its normal and filed by
  what it finds:
  - no collision;
  - see-through collision only;
  - unmet collision only.
- **(e) reach shrink only**: wall faces whose PENETRATION is 0.0001 or more, so line 1 shrinks its reach there
  instead of stopping.

**Part 2: the sweep.** Built on every admitted wall face at least 6 u high and 6 u wide:
- **Body**: placed every 12 u along the face, 6 u off it, on a floor at the face's foot, on either side. Standing and
  crouched.
- **M67** (radius 150): on the other side of the face, at 30, 45 and 60 u straight across and at 45 u at +-35 degrees.
  Once at rest (floor + 1) and once in the air (floor + 15).
- **Kept cases**: both points have a clear approach up to 4.5 u off the face's plane, so the face, or a wall up to
  4.5 u thick, is what lies between them. Neither point is inside a closed solid such as a tank, a container, or a
  building with no inside (`inSolid`).

**Rules each case is judged by.**
- Line 2, to the port's head, under four rules:
  - v0.4.18 (one-sided and see-through);
  - one-sided only (v0.4.15-17);
  - see-through only;
  - neither (v0.4.14).
- Line 2 to the posed eye, 15.88 standing and 9.90 crouched (research 180).
- Line 1 to `ROOT_HEIGHT`, 11.48 standing and 5.5 crouched. This is a stand-in for the unread end point (C1). It is
  judged once one-sided (the reading) and once two-sided (the port's `BLAST_REACH_LINE_SIDES_READING`).

**Labels used in the tables.**
- **THROUGH**: the line to the head crosses the sampled face itself.
- **OVER/AROUND**: everything else.
- **Opened by**: v0.4.14's rule stops the line and v0.4.18's lets it through. The faces v0.4.14 met are the line's
  "openers".
- **Drawn on the line**: every line the port leaves open is also tested against the drawn triangles.

**Run.** 5 tests passed in 186 s (2026-11-11). The test pins MP6's and MP2's headline counts. It also asserts that no
THROUGH line is open under v0.4.14's rule, as a sanity check of the measure.

## 2. The sweep

Each cell is standing / crouched.

| map | THROUGH lines | open, v0.4.18 (today) | open, one-sided only | open, see-through only | open, v0.4.14 |
|---|---|---|---|---|---|
| MP6 Desert Glory | 9009 / 10438 | 426 (4.7%) / 557 (5.3%) | 14 (0.2%) / 41 (0.4%) | **417 (4.6%) / 535 (5.1%)** | 0 / 0 |
| MP2 Frostfire | 1142 / 1731 | 158 (13.8%) / 458 (26.5%) | 33 (2.9%) / 50 (2.9%) | **140 (12.3%) / 427 (24.7%)** | 0 / 0 |
| MP51 Vigilance | 2072 / 2438 | 134 (6.5%) / 179 (7.3%) | 57 (2.8%) / 84 (3.4%) | 82 (4.0%) / 100 (4.1%) | 0 / 0 |
| MP72 Crossroads | 6441 / 7888 | 620 (9.6%) / 927 (11.8%) | **583 (9.1%) / 769 (9.7%)** | 78 (1.2%) / 196 (2.5%) | 0 / 0 |

Every case the port hurts (v0.4.18's line open), and the share each cause accounts for. The causes overlap, so the
shares do not sum to 100%.

| map | hurt | line 1 (one-sided) stops | opened by see-through alone (drawn on the line) | opened by one-sided alone (drawn on the line) | eye shut (head height alone) | no face, drawn on the line |
|---|---|---|---|---|---|---|
| MP6 | 3005 / 1585 | **873 (29.1%) / 566 (35.7%)** | 530 (17.6%) / 604 (38.1%) (70 / 89) | 76 (2.5%) / 45 (2.8%) (66 / 41) | 198 (6.6%) / 371 (23.4%) | 52 (1.7%) / 81 (5.1%) |
| MP2 | 1328 / 1307 | 110 (8.3%) / 125 (9.6%) | **297 (22.4%) / 715 (54.7%)** (15 / 85) | 28 (2.1%) / 33 (2.5%) (26 / 31) | 7 (0.5%) / 42 (3.2%) | 2 / 1 |
| MP51 | 1365 / 1033 | **314 (23.0%) / 630 (61.0%)** | 87 (6.4%) / 121 (11.7%) (22 / 24) | 123 (9.0%) / 124 (12.0%) (114 / 123) | 32 (2.3%) / 118 (11.4%) | 6 / 6 |
| MP72 | 4052 / 3132 | 789 (19.5%) / 1387 (44.3%) | 89 (2.2%) / 195 (6.2%) (7 / 40) | **937 (23.1%) / 966 (30.8%)** (924 / 958) | 58 (1.4%) / 341 (10.9%) | 48 / 58 |

**Where line 1 acts.** It barely touches the THROUGH lines the rules open: one-sided, it stops 0-3% of them on MP6,
MP2 and MP72, and 11% on MP51 crouched. Most of what it stops is OVER/AROUND: a window or a low wall.
- **OVER/AROUND share stopped by line 1**: MP6 33% / 55%, MP2 9% / 14%, MP51 26% / 71%, MP72 23% / 62%.
- **Two-sided, the port's departure**, line 1 would stop far more of the THROUGH openings: MP72 86% / 80%, MP51
  39% / 50%, MP2 11% / 8%.

## 3. The ranking: what explains "through walls" on Desert Glory and Frostfire

The question has two answers, because the reading and the timing point at different causes.

### 3.1 Against the original as read: the port's difference from the original

- **Missing line 1** is the only cause on this list that departs from the reading.
  - **Desert Glory**: 29% / 36% of every case the port hurts. That is the largest cause, and DG stands out from
    MP72's 19% / 44% only standing.
  - **Frostfire**: 8% / 10%.
  - **Where on DG**: nearly all of it is on the line over a sill or a low wall in DG's two buildings. These are lines
    with no collision face on them and the wall below.
  - **Worst DG owners** (line 1 stops, the port hurts):
    - `building_wc1/wc1di2` (124 cases) and `wc1di1` (115);
    - `building_wc2/g13` (96), `g12` (96), `wc2di2` (91) and `wc2di1` (84).
  - This is Machete's "through walls **and windows**".
  - Line 1's end point is a stand-in (`ROOT_HEIGHT`). These shares hold only if C1 puts the point near the root. An
    end point at the head would remove most of them.
- **The head height** (`HEAD_OVER` 18.3 / 11.1 against the eye's 15.88 / 9.90): DG 6.6% / 23.4%, mostly the same
  cases as line 1.
- **One-sided faces and see-through faces are not departures by the reading.** Line 1, one-sided as read, would stop
  0-3% of the THROUGH lines they open. If the readings hold, the original opens those lines too.

### 3.2 Against v0.4.14: what changed before the reports

**The see-through rule (v0.4.18) is what makes DG and Frostfire stand out.**
- **Share of THROUGH lines it opens**:
  - DG 4.6% / 5.1%;
  - Frostfire 12.3% / 24.7%;
  - Vigilance 4.0% / 4.1%;
  - Crossroads 1.2% / 2.5%.
- **Share of all cases the port hurts that it opens**:
  - DG 18% / 38%;
  - Frostfire 22% / 55%;
  - the controls 2-12%.
- The one-sided rule (v0.4.15) opens far less on DG (2.5% / 2.8%) and on Frostfire (2.1% / 2.5%). Crossroads is where
  it opens the most (23% / 31%), and Crossroads drew no report.

**What the see-through rule opens: mostly invisible collision with nothing opaque drawn on the line.**
- **Desert Glory**:
  - the hostage jail's two bar sets, `nohostagerescue` METAL_GRATE and `okhostagerescue` INVISIBLE_DI: 288 cases, 68
    with opaque drawn geometry on the line (the `cellbar_vis` bars);
  - the scaffold brace's `noclimb_invis` and `deck_climbers` (research 281): 183 cases, 42 drawn;
  - `building_wc2/di_jail1` METAL_GRATE: 152 cases, 8 drawn;
  - the garage's INVISIBLE_DI face: 112 cases, 0 drawn;
  - `invis_di`: 107 cases, 12 drawn;
  - `building_wc2`'s INVISIBLE_DI faces: 104 cases, 10 drawn;
  - **the utility truck**, `truck_stop/.../orando_truck_utility/body_truck` INVISIBLE_DI: 80 cases, **36 drawn**;
  - the cell door `cdoor1/mp6_celldoor`: 68 cases, 12 drawn;
  - **`crate07`'s `invdi`**: 51 cases, 6 drawn.
- **Frostfire**:
  - the warehouse rail `warehouse/wraildi`: 218 cases, 27 drawn;
  - the ramp side walls `rmp2` (172 cases, 5 drawn), `rmp3` (167, 4) and `rmp1` (107, 0);
  - the rails `t1ramp/raildi` (106, 28) and `t2_rampd1/di_rail_tun12` (101, 30);
  - the boundary walls `out_di1_*`: 0 drawn.
- **Opaque geometry on the line**: across both maps it is there on only 1-6% of all hurt cases (see-through, drawn
  column). Most see-through openings pass where nothing opaque is drawn: between bars, through railings drawn in the
  alpha pass, or along invisible ramp walls.

**One-sided faces** open visibly solid geometry on a few owners:
- DG: the utility truck's METAL_THICK body (14 cases) and the garage and `building_wc2` window frames,
  `mp6_window_med` / `mp6_window_wide` (WOOD_THIN, 8-14 cases each).
- Frostfire: the crane deck `crane=crane/dicranedeck` (32) and `refinery` (16).

**Collision missing under drawn geometry ((d) on the line)**: 1.7% / 5.1% of DG's hurt cases and 0.2% / 0.1% of
Frostfire's.
- On DG it is crates `crate04` and `crate05` (`parts_good/visual`) and their `parts_bad` pieces. Those pieces are
  debris the zAnim opening state probably hides; this census does not apply that state, so part of the share is an
  artefact.
- It is the disc's own data, the same in both games.

### 3.3 Ranked, with numbers (standing / crouched, share of the cases the port hurts)

| rank | Desert Glory | Frostfire |
|---|---|---|
| 1 | Missing line 1 (one-sided, root end point): 29.1% / 35.7% | See-through rule (v0.4.18): 22.4% / 54.7% (opaque drawn on the line: 1.1% / 6.5%) |
| 2 | See-through rule (v0.4.18): 17.6% / 38.1% (opaque drawn: 2.3% / 5.6%) | Missing line 1: 8.3% / 9.6% |
| 3 | Head height (`HEAD_OVER`): 6.6% / 23.4%, mostly overlapping 1 | One-sided rule (v0.4.15): 2.1% / 2.5% (drawn 2.0% / 2.4%) |
| 4 | One-sided rule (v0.4.15): 2.5% / 2.8% (drawn 2.2% / 2.6%) | Head height: 0.5% / 3.2% |
| 5 | Drawn geometry with no collision: 1.7% / 5.1% | Drawn geometry with no collision: 0.2% / 0.1% |

## 4. The census by type (part 1)

| | faces | admitted wall faces | (a) one-faced | ... with room behind | (b) unmet | (c) see-through | (e) PEN >= 0.0001 wall faces |
|---|---|---|---|---|---|---|---|
| MP6 | 5887 | 3325 | 1819 | 80 | 179 | 208 | 456 |
| MP2 | 3321 | 2425 | 1107 | 58 | 19 | 320 | 287 |
| MP51 | 8950 | 4930 | 2823 | 141 | 39 | 96 | 16 |
| MP72 | 9838 | 7071 | 3093 | 375 | 399 | 786 | 835 |

*(2026-11-14, OT.R127: the port's MP72 hull is now 9836 -- r0004's node 0x2d8500, two INVISIBLE_DI quads at the gray
tents' fronts, is not applied ([research 388](388-r0004-blast-see-through.md) §4). The row above is the census as run
before the ruling and is not re-run here.)*

**Desert Glory, by type** (one-faced; see-through; drawn wall area with no collision / see-through only;
PENETRATION > 0):
- **Unnamed geometry `gNNN`** (DG's mud walls and rock): 1055 of 1074 one-faced, 4 with room behind; 9.5% no
  collision.
- **Walls**: 123 one-faced (21 with room); 4 see-through; 2.5% no collision.
- **Building shells**: 230 one-faced (15); 30 see-through (INVISIBLE_DI); 4.1% / 0.7%; 21 METAL_THIN.
- **Doors**: 40 one-faced; 32 see-through (METAL_GRATE, INVISIBLE_DI: each `mp6_door` carries one INVISIBLE_DI face,
  `g7`); 3.7% / 4.3%; 36 WOOD_THIN.
- **Bars, jails and grates**: 27 see-through.
- **Furniture and props**: 32 see-through; 55% of their drawn wall area is covered only by see-through collision
  (shelves, tables).
- **Vehicles**: 73 of 116 one-faced (7 with room); 4 see-through; 33% / 2.1%.
- **Crates**: 39 of 64 one-faced; 15.6% no collision; 48 WOOD_THIN (0.25).
- **Windows**: 77 of 77 one-faced; all GLASS or WOOD_THIN (line 1 shrinks its reach and line 2 stops).

**Frostfire, by type**:
- **Barrels, tanks and pipes**: 448 of 1320 one-faced (8 with room behind); 77 see-through; 240 BARREL (0.5).
- **Building shells**: 317 of 526 one-faced (20); 148 see-through (INVISIBLE_DI, METAL_GRATE); 34.9% no collision.
  Mostly the `deckv_*` deck sides and the `drilltower` / `relieftower` backdrop.
- **Crates and containers**: 242 of 324 one-faced (0 with room: they are closed boxes).
- **Fences and rails**: 18 of 40 one-faced (18 with room); 24 see-through; 39% of drawn rail area see-through only.
- **Grates**: all 54 faces METAL_GRATE, 68.8% of their drawn area see-through only.

**What the counts say.**
- **Most one-faced faces have nothing behind them a grenade can reach**: terrain, closed boxes, closed buildings.
  Only 2-12% have room behind: MP6 80, MP2 58, MP51 141, MP72 375. That is why the one-sided rule opens little on DG
  and Frostfire, and the most on Crossroads.
- **The port's readers drop no collision on any type.** Two reductions exist:
  - `worldDi` leaves out a nested instance's own `di`, as research 24 s1.1 reads the engine: 79 polygons on MP6 and
    20 on MP2;
  - the query gate refuses owners that are off or carry no `m_hasDI`: 59 polygons on MP6, 0 on MP2.
- **Neither reduction is on a line the sweep found open.** No "object type with collision off" turned up. Drawn
  geometry with no collision is the disc's own (part 2: 1.7% / 5.1% on DG).

## 5. The worst spots, for capture (shadow PC, r0004, two clients, friendly fire on)

The coordinates are the map's own world coordinates, the port's.
- **Victim**: feet at the point given, in the posture given.
- **Thrower's M67**: at the blast point given, resting where the z is the floor + 1, in the air where it is the floor
  + 15.
- **Port today**: damage at every spot.
- **Score**: whether the original deals any damage, 10 throws each.

**Desert Glory (MP6)**

| # | between | victim feet | M67 | what it settles |
|---|---|---|---|---|
| D1 | the utility truck, `truck_stop/.../orando_truck_utility/body_truck` (INVISIBLE_DI + one-faced METAL_THICK) | (1891.9, 0.0, 1852.6) standing | (1860.7, 1.0, 1870.4) | see-through / one-sided through visibly solid geometry |
| D2 | the jail bars `nohostagerescue` / `okhostagerescue` | (1740.0, 50.0, 1234.5) standing | (1704.0, 51.0, 1234.5) | METAL_GRATE / INVISIBLE_DI seen through (research 388) |
| D3 | `building_wc1/wc1di2`, a wall with a window above it | (1605.0, 30.0, 2136.0) standing | (1605.0, 31.0, 2100.0) | line 1 (C2: the sill case) |
| D4 | `building_wc2/g13`, ground floor | (1386.0, 1.3, 1549.8) standing | (1350.0, 1.0, 1549.8) | line 1 |
| D5 | the scaffold brace `deck_climbers` / `noclimb_invis` (research 281) | (1706.5, 0.0, 1446.1) standing | (1705.5, 1.0, 1410.2) | INVISIBLE_DI seen through |

**Frostfire (MP2)**

| # | between | victim feet | M67 | what it settles |
|---|---|---|---|---|
| F1 | the warehouse rail `warehouse/wraildi` (INVISIBLE_DI) | (784.0, 100.0, 923.0) standing | (820.0, 101.0, 923.0) | INVISIBLE_DI seen through |
| F2 | the ramp side wall `rmp2` (INVISIBLE_DI) | (378.0, 103.5, 1101.0) crouched | (378.0, 101.0, 1065.0) | INVISIBLE_DI seen through |
| F3 | the crane deck `crane=crane/dicranedeck` (one-faced METAL_THICK) | (992.0, 152.6, 605.0) standing | (1028.0, 153.6, 605.0) | one-sided (H421) |
| F4 | the shed `shed/di_shed02` (over the top) | (381.0, 143.1, 1228.0) crouched | (423.9, 157.0, 1253.8), in the air | line 1 |

**What each outcome means.**
- **D1, D2, D5, F1 or F2 shelter in the original**: research 388's see-through reading (r4 0x5a6bb0-0x5a6bc8) is
  wrong for INVISIBLE_DI, METAL_GRATE or both.
- **D3, D4 or F4 shelter**: line 1 is confirmed, and C1 gives its end point.
- **F3 or D1's METAL_THICK body shelters**: mode 0x20 is not one-sided (H421).

**How the captures are taken** (the main controller redotcom-2f, 2026-11-11, on redotcom-cc's question; a method
choice on our own local rig, not the owner's):
- Natural throws come first. Each is scored by the grenade's own position at detonation, as read through PINE.
- The victim may be placed by a PINE write, as set-up (like LIMB-TRUNK's).
- A grenade may be written only under all of these conditions:
  - it is already at rest (velocity read as 0) and its fuse has not ended;
  - the nudge is at most ~8 u, to bring a natural landing onto the spot;
  - the write is logged with its before and after positions and labelled a set-up capture.
- A spot that uses writes also gets at least 3 natural throws without writes, reported apart. Where the two sets
  disagree, the natural set stands.
- A grenade in flight is never written, nor its velocity or its fuse. F4 ("in the air") takes natural throws only,
  each with its actual detonation point. If F4 can't be got naturally, the capture says so.

**What each spot tests, from the port's side** (2026-11-13: a dev-disc probe at `agent/blast-lift` f2e9dcac7c, b0's
box, `agent-mail/evidence/nade-blast/box/probe-f2e9dcac7/`; the burst at the floor + 1.1, the lifted point of s10-s11;
line 2 to the posed head, line 1 to 11.48, 8, 6 and 3 over the feet; every face crossed, two-sided, with its side; the
port's verdict with NADE-BLAST's line 1). Written before the captures' results, so each result's meaning is on file:

| spot | faces on the lines (side) | the port | what the original's outcome says |
|---|---|---|---|
| F1 (the rig's 2 bursts and the recipe point) | `warehouse/wraildi` INVISIBLE_DI, PEN 1, from its front -- the only face, on both lines at every height | open | hurt: line 2 sees through INVISIBLE_DI (research 388); spared: it does not |
| F2 (crouched) | `rmp2` INVISIBLE_DI, front then back -- the only faces | open | the same, for `rmp2` |
| D1 | the utility truck's `body_truck` INVISIBLE_DI, from its back -- the only face | open | the same (and from its back: one-sided too) |
| D2 | `nohostagerescue` METAL_GRATE (PEN 0.4) and `okhostagerescue` INVISIBLE_DI, front then back | open | hurt: both seen through, the grate's PEN product within reach; spared: one is cover |
| D5 | `noclimb_invis` INVISIBLE_DI (front), `deck_climbers` INVISIBLE_DI (back) | open | the same, for the brace |
| D3 | line 1 (3 to 11.48): `building_wc1/wc1di1` ASPHALT, PEN 0, from its front, then `wc1di2` from its back -- shut; line 2: over the wall's top, meeting only `broken1_camcollide` (camera-only, not admitted) | line 1 shut, line 2 open: spared | spared: line 1 exists and ends under the line-2 crossing's height, once the wall's top and the camera-only faces are settled (the confounds below); hurt: no line 1, or it ends near the head |
| D4 | the same on `building_wc2/g12` / `g13`; line 2 meets only `building_wc2/camonly_collide` | the same | the same |
| F3 at the recipe point | `crane=crane/dicranedeck` METAL_THICK, PEN 0, from its back | open (one-sided) | void: the point has no floor on the original (s7). Below the deck (bursts at x 1010 / 1028 / 1040, y 103.6; probe `f3probe`) both lines meet `crane` / `crane=crane` at 152.64 on their front -- downward faces, the crane's underside -- and are shut under either rule: no test of the one side. F3 waits for a spot where a solid face is met from its back alone |
| F3-new (MP6, from the main controller's one-sided finder, #1) | `jwall06` SAND, PEN 0, normal (0.09, -0.02, 1.00), met from its BACK alone on every line (the head at 6.3, line 1 at 1.8-4.8 over the feet); the grenade at rest (1900.66, 0.10, 1622.17), the victim standing at (1888.78, 0, 1649.72), 30 u, flat SAND floors, the walker standing at both | open (one-sided): hurt | hurt: the one side holds at this face (v0.4.15's rule measured); spared: the blast's lines are two-sided -- v0.4.15's one-sided blast lines are reverted at once (their own task, Crossroads re-run lifted). The wall's height is checked by a probe (`jwall`) before the throws. *Withdrawn:* the wall is tall (clear only above 36-40) but the grenade's point lies under its own top (surfaces 0 and ~43 over it, no ground past z ~1620): a pocket inside an open-backed shell, not a place play reaches |
| F3-new, second pick (MP6, finder #6) | `building_wc2`'s outer wall, SAND, one-faced, 17 wide; the grenade inside the building at (1353.43, 0.10, 1455.5), in a bay walled 4.5 / 12.5 / 23.6 u away under a sloping roof at 28-43 (probe `spotcheck`), the victim outside at (1323.43, 0, 1455.5), 30 u; the other finder spots on MP6 sit in a 3 u slot (#8) or inside the jail bars (#9) | open (one-sided): hurt | taken only if the bay is open to a natural throw (the rig's look); the same meaning as above. A wall is usually one-faced because its back is never seen or reached, so clean one-sided spots are rare by construction |

The confounds on D3 and D4 (the main controller's merge rule, 2026-11-13): a "spared" there counts for line 1 only if
the head line's own cut-off, 1.1 + (T - 1.1) / 0.75 for the wall's top T where line 2 crosses, stands well under the
posed head -- T is measured by a second probe (`d34top`) -- and if a measured control shows line 2 open over a solid
wall with no camera-only face on it: the C1 ladder's wall, hurt at its near step and spared at its far one.

**C1 by the wall ladder** (2026-11-13: the rig cannot break on the live match, so line 1's end is bracketed by damage
or none behind one wall, the main controller's method with redotcom-cc's correction). A line from the lifted burst B (the
floor + 1.1, s10) to a point h over the victim's feet clears a flat-topped wall of top T (over the shared floor) only if

  h > 1.1 + (T - 1.1) (dg + dv) / dg,

with dg the grenade's and dv the victim's feet's horizontal distances to the wall's NEAR (grenade-side) face -- the
binding edge, since the line rises toward the victim -- so dv includes the wall's thickness t and the body (dv >= t + 1).
A body is hurt only with both lines clear, and line 1 ends no higher than the head, so the outcome flips from hurt to
spared where the threshold passes line 1's end: step the victim back from the far face, 3 u at a time, the grenade fixed.
Victim and grenade each 18 u off a wall bracket nothing (a threshold of about 2T - 1.1). On MP2's 10.5-high pipe
(`longpipes_24/di_pipe1_2`, 7.9 thick, possibly rounded) at dg = 30 the threshold is 13.0 with the victim against it, so
any end under 13 is spared there (dg = 60: 11.9). On MP2's 8.5 shed wall at dg = 30, for t = 3: dv 4 -> 9.5, 7 -> 10.2,
10 -> 11.0, 13 -> 11.7, 16 -> 12.5, 19 -> 13.2 -- the root stand-in (11.48 standing) flips between 10 and 13, a box
midpoint near 9 before 4. The rig measures T, t and the top's flatness with its segment probe first, rescores every throw
from its real detonation point and the victim's real feet, and solves h from the flip; MP6's flat 3.0-thick walls are the
fallback.

## 6. The recommended fix scope (for the controller and the owner)

1. **Line 1 for players and hostages.** This is the one change the readings support today, and on Desert Glory it
   is the largest cause.
   - One-sided, as read: the PENETRATION product, `ignoreExplosionDI` honoured, one line 1 per SEAL.
   - The end point is a named placeholder until C1. With a root-height point it stops 29% / 36% of DG's hurt cases
     and 8% / 10% of Frostfire's.
   - Simulation track, its own task and fresh review. The skeptic's scope (06) stands: not on a guessed end point in a
     release without the owner's word.
2. **`HEAD_OVER` to the posed head bone, as a named reading.** 6.6% / 23.4% on DG, mostly overlapping item 1.
3. **Do not revert or limit the see-through or one-sided rules on these reports alone.** Both are readings of the
   original, and line 1 as read would not stop what they open (0-3%).
   - The see-through rule is the change that lines up with the reports in time and by map. Captures D1, D2, D5, F1
     and F2 settle it.
   - If the original shelters there, limit the see-through set to what the capture shows. If it does not, the "through
     walls" on those faces is the original's behaviour.
   - A preference to shelter anyway is the owner's to rule, as a HUMAN_TASKS row; it is not to be applied meanwhile.
4. **No collision fix.** No object type has collision the readers drop on an open line. Drawn geometry with no
   collision is 0.1-5% of hurt cases and is the disc's own data.
   - *Rescoped 2026-11-13:* the original's collision batch also walks each grid cell's CLUTTER list (`FUN_002d3cf0`
     D:L175686-175708, `FUN_002d4780` D:L175765-175788; the investigation seat 8a's read), and the port loads no clutter
     collision. On the two reported maps it changes nothing: MP6's clutter (rocks, grass) carries no collision on the
     disc and MP2 has none (8a's probe, `agent-mail/evidence/tree-probe/tp1/`, `gate-runner/out/tree-probe-tp1/`) -- no hurt case here has a stopping clutter
     instance on its line. On MP1 it does: 145 tree instances in 10 models (`alaska4d_tree*`; WOOD_THICK stops both
     lines, SNOWY_TREE at 0.7 shrinks line 1 and stops line 2) the port's blasts, rounds and bodies pass through --
     8a's task, not this note's. The all-map census (tp2, `agent-mail/evidence/tree-probe/tp2/`): clutter would shut
     line 1 / line 2 at 145 / 145 instances on MP1, 93 / 134 on MP82, 76 / 82 on MP61, 39 / 39 on MP5 and 3 / 3 on MP10;
     0 on every other map -- none of it in the port's grid.

## 7. Limits of this measurement

- **Line 1's end point** is `ROOT_HEIGHT`, a stand-in. Every line 1 share moves with C1.
- **The head point** is `HEAD_OVER`, the port's own. The eye stands in for the head bone. Prone is not measured.
- **The sweep is geometric**: bodies 6 u off a face, blasts 30-60 u across it, two blast heights. It is not a sample of
  where players stand or where grenades land, so compare shares between maps, not raw counts.
- **The type key is a name rule.** DG's `gNNN` geometry is filed as "unnamed".
- **Drawn geometry**: alpha-pass chunks are left out, so bars and railings drawn with cut-out textures count as "not
  drawn". The zAnim opening state is not applied, so destroyed-state debris can count as drawn.
- **`inSolid`** can miss a closed solid modelled without a roof face, and can flag a space under a one-faced roof whose
  walls also face out.
- **Not measured**: a pane broken by the grenade in flight (D2 of the synthesis) and the resting-charge chain (D1).
- **Clutter** (checked 2026-11-13, s6 item 4): the census reads the worldmodel's collision only, as the port's grid does. On
  MP6 and MP2 nothing is lost (no clutter collision there); on a map with solid clutter (MP1's trees) the port's lines
  pass through trees the original's stop, until clutter collision enters the hull and the grid (its own task).
- **The blast's floor** (`floorNear`) is any hull polygon whose footprint holds the point within 12 u of the body's floor
  -- its facing, its class and whether a body or a grenade could stand on it are not tested. F3's M67 point (1028, 153.6,
  605) is one it got wrong: on the original a body placed there falls to y 102.5 (the Shadow rig, 2026-11-13), so the
  deck ends between x 992 and 1010 and F3 is taken from below the deck instead (s5).

## 8. The fix (NADE-BLAST, V21-AA, 2026-11-13; simulation track, reading, pending review)

`agent/nade-blast`. Item 1 and item 2 of section 6, nothing else: the see-through and one-sided rules of line 2 are
unchanged (items 3 and 4 wait for D1, D2, D5, F1, F2 and F3).
- **Line 1** (`../../packages/viewer/src/net/blast.ts` `blastLine1`; the room's `blastLines`, taken by `blastPlayers`
  and `blastHostages`): the explosion's walk `FUN_003c7dd0` (D:L318974-318992) runs `FUN_003c80e0` (D:L319096-319143)
  before the body's handler, and a refusal skips the body. The gate is the PENETRATION product (`reachGate`: one face
  under 0.0001 refuses, the radius squared times each face's PENETRATION under the line's squared length refuses), over
  the faces the round's class admits (`roundAdmits`), one side (mode 0x20, research 281 s4.3), one per owner object
  (`REACH_HITS_READING`). Its end is the midpoint of one of the body's node boxes (`FUN_003c7ee0` D:L319049-319056:
  `FUN_00308fc0` at 0.5 between the box's `+0x40` and `+0x4c`, then `FUN_00310980`), the first of the SEAL's nodes in
  the query's list (the `+0x94` dedupe, D:L319030-319042); which node is unread, so the root height stands in
  (`BLAST_LINE1_END_PLACEHOLDER`) until capture C1. `IgnoreExplosionDI` skips it (byte `+5` bit 1, D:L319096). The
  body is not in the world's collision, so the self-exclusion (D:L319105-319109) has nothing to skip. A hostage takes
  the SEAL's heights for both lines (its own skeleton unread).
- **Line 2's end** (`BLAST_HEAD_OVER_READING`): the posed `head` bone (`actor+0x308`, `FUN_005ac070` D:L464841-464853);
  the posed eye stands in for it (15.884 standing, 9.904 crouched: `scopeEyeHeight` over the idle root 11.484 / 5.504, research 180
  s1.3), straight over the feet. Was the room's unnamed `HEAD_OVER` (18.3 / 11.1 / 1.7).
- **Held by** match `test/roomBlastLine1.test.ts` (synthetic: a 13-high METAL_THICK wall 6 in front of a standing SEAL;
  a METAL_THICK band from 12.5 to 16; a METAL_GRATE with the SEAL past 150 x sqrt(0.4); line 1 one-sided; each RED on
  the base) and the dev-disc matrix's grate at 110 u (`roomBlastOcclusion.devdisc.test.ts`, its `it.fails` made a RED).
- **Not to ship on the placeholder** (the skeptic's scope, 06; the main controller's order): line 1 merges when C1 has
  given its end point, or with the owner's word.

## 9. Placeholders and readings

| name | what stands in | what settles it | status |
|---|---|---|---|
| `BLAST_LINE1_END_PLACEHOLDER` | line 1's end on a body over the feet: the top of the bracket the captures allow, not a body point: standing 11.3 (LINE1-END, 2026-11-13: C1's near step's throws 3 and 4 on MP6's ladder wall spared at cut-offs 11.346 / 11.313 on the disc's hull (the cap sloping to ~10.22 at the crossing) where 11.48 clears the wall; the ~70 u open control hurt 2 of 3; both spared by the corrected count alone 3.7 %, so at ~96 % line 1's end is under 11.35); the bracket [unread, 11.31) -- 11.3 sits 0.013 under throw 4's cut-off, its corroborating tops 13.1 (D4) and 13.3 (the far step); crouched 5.5 and prone 2.17 the root's still, unmeasured; a hostage takes the SEAL's. The remaining error each way: a true end below 11.3 still lets the port hurt a little where the original spares; and about one chance in six (throw 4 spared by a zero count: 0.21 against 1) the end lies in [11.31, 11.35), where the port at 11.3 spares where the original hurts. Which node line 1 aims at is the target list's own order after `FUN_003c7af0`'s partition (+0xa1 bit 2), unread | the node and its midpoint: a read of the list's order, or a capture naming the node; LATER 991 | open, bracketed |
| `BLAST_HEAD_PRONE_PLACEHOLDER` | the prone head over the feet for line 2: 1.7, straight up (`HEAD_OVER`'s old value) | the `head` bone's pose at `seal_prone`'s key 0, or a capture of a prone SEAL behind a low face; LATER 991 | open |
| `BLAST_HEAD_OVER_READING` | line 2's end: the posed eye standing and crouched (15.884 / 9.904 over the idle root 11.484 / 5.504), the prone placeholder; a hostage takes the SEAL's | a read of the `head` bone's posed height (`actor+0x308`) | the end at the head bone: reading, pending review; its height (the eye for the bone): placeholder grade, open |
| `BLAST_POINT_LIFT_READING` | the round's `+0x48` 1.0 over where it went off: the lines, the radius factor, the count, the flash and the knock's origin read it; `GetDamage`'s falloff and cones, the target list and the effects stay at the node (s11) | read at `FUN_003c8330` D:L319266 (s11); measured on r0004, n = 2 resting M67s -- an impact, an in-air burst and the other round kinds would confirm it | reading, pending review (LATER 992) |
| `BLAST_LINE1_SIDES_READING` | line 1 one-sided (mode 0x20, research 281 s4.3) | capture F3 / H421 (a one-faced face between) | reading, pending review |

## 10. The rig's readings of the original (2026-11-13, N1 on the Shadow rig; r0004, two clients, our local Horizon)

Evidence kind: **a memory read of the original running** (PCSX2 savestate snapshots diffed around natural throws, and
per-frame reads through PINE), two natural M67 throws on MP2. Not yet scored by the harness or compared value for value
with the port, so nothing here is proven; each item is what the rig read, relayed by "Shadow relay setup" (PC clock
~05:10Z).
- **The round pool** (r0004): 100 slots at stride `0xc4`, shared with bullets; the base is per console and stable in a
  session (`0x013d4ee0` on the thrower's, `0x013d4980` on the other's). Every slot opens with the word `0x00434d50`,
  `0x00434d70` at `+0x18`. The r0001 layout (9f's reading of the spawn `FUN_003cb1a0`, r0004 `0x003ed340`) holds:
  `+0x3c` the start (the hand), `+0x48` the current position, `+0x54` the previous frame's, `+0x60` the velocity
  (0 at rest). `+0x94` reads 100000.0 throughout: **not** the fuse. `+0xac` (the owner id?) unconfirmed.
- **The M67's life** by its flags word `+0x4`: `0x80e` in flight, `0x80c` after a bounce, `0x80d` at rest (y the floor +
  0.1); the detonation frame `0x0d` then `0x40d`, about 3.80-3.85 s after the release (rest at 3.76-3.79 s), on both
  throws.
- **The blast's point is lifted at the detonation**: on the detonation frame `+0x48`'s y rises by exactly 1.0 (100.1 ->
  101.1 on a floor at 100), x and z unchanged. **The port blasts at the rest point** (`room.ts` `blast`, the grenade's
  position, the floor + 0.1): a departure this task found, not yet fixed -- LATER 992, a separate task (the main
  controller's call): its code is not read, nor whether an impact, an in-air detonation, C4, the claymore or a launched
  round lift too.
- **Every capture is scored from the lifted point** (the rig's detonation frame, `+0x48` at flags `0x0d`), so the
  original's outcome at a spot is compared with the port's lines drawn from that point, not from the rest point. The
  wall ladder's bracket for line 1's end is read the same way: a line from the lifted point B (the floor + 1.1 at
  rest) across a wall top T at the fraction f of the way to the victim ends at E = B + (T - B) / f over the victim's
  floor -- the 0.1 over the finder's floor + 1 moves E by 0.1 (1 - 1/f) u, under 0.3 u at the recipe's f >= 0.25, well
  inside the ladder's 2 u rungs.
- **The damage lands** on the victim's console about 0.15-0.2 s after the detonation frame.
- **F1 scored: 10 of 10 hurt** (MP2, the warehouse rail `warehouse/wraildi`, INVISIBLE_DI; natural throws, no nudges; a SEAL's
  M67s from (880, 100, 923) facing -x, the victim a Terrorist standing at (784, 100, 923) facing +x; the bursts on the
  floor + 1.1 at x 810.6-827.1, z 921.1-921.7, 25.6-42.1 u from the feet; most killed, every part to 0 but the head,
  armour 25 -> 21.25; the damage 125-140 ms after the detonation frame). Every line from these bursts crosses the rail
  alone, from its front, at every height (s5's table, the probe): **the original's line 2 sees through INVISIBLE_DI at
  this face**, as research 388 reads r0004 -- v0.4.18's see-through rule agrees with the original here (the port hurts
  him too). n = 10, any damage or none; not harness-scored. One face of one material: METAL_GRATE (D2) and the other
  INVISIBLE_DI faces (D1, D5, F2) are their own captures.
- **D4 scored: 10 of 10 spared** (MP6 in Extraction, `building_wc2/g13`; natural throws, no nudges; a SEAL's M67s from
  inside the building at (1290, 0, 1549.8), the victim a Terrorist standing, placed at (1386, 1.3, 1549.8) -- held there
  on 4 throws, slid to (1390.4-1391.8, 0.3-1.2, 1548.6-1549.2) on 6; the bursts on the floor + 1.1 at x 1334.2-1347.4,
  z 1550.9-1552.2, 40.0-56.3 u from the feet; no health or armour changed on any part). Inside the full-damage 75 from
  the node, at least 2 fragments by the count: not distance. Read as line 1 shut (s5's table) once a per-throw probe
  confirms each real burst-and-feet pair's lines (`d4throws`) and beside the far step and the 61 u open control (the
  main controller's merge rule). *The per-throw probe* (`d4throws`; the 10 bursts against the 4 logged victim positions):
  line 1 shut in all 160 line-and-height cases (`building_wc2/g12` ASPHALT from its front); line 2 open in all 40 by the
  port's rule, meeting only `camonly_collide` (camera-only) on 35 -- on 5 (throws 4, 6 and 9 at the slid positions) it
  also meets `mp6_window_wide` (WOOD_THIN, cover) from its back, open only one-sided: those three throws are confounded
  by the one-sided question, the other 7 are clean (all spared).
- **C1's ladder wall, the far step: 4 of 4 spared** (MP6 `building_wc1/wc1di1`, top 10.25, near face x ~1566; natural
  throws; the victim ~16 u past the near face, dv 15.7-16.4; the grenade rolled to dg 34.3-47.5; 50.2-63.1 u burst to
  feet; no part changed). The head line's cut-off 1.1 + (T - 1.1)(dg + dv)/dg is 13.3-14.6 by throw, 1.3-2.6 u under the
  posed eye, and line 2 crosses no face there (`d34top`): spared is line 1 shut -- its end on a standing body under 13.3.
  *The per-throw probe* (`farctl`, the 4 real pairs): line 2 open crossing no face 4 of 4; line 1 shut 16 of 16
  (`building_wc1/wc1di2` ASPHALT from its front, then `wc1di1`). The open control's 3 pairs: every line open, no face.
- **The open control: 3 of 3 hurt** (the same burst side, the victim ~59-61 u away on open yard, nothing between):
  light damage (armour 25 -> 21.25 on one part; a part 1.00 -> 0 / 0.85), but damage: the wall is what spares at the far
  step. *An observation, not this task's:* the damage at ~60 u is lighter than "full damage inside 75" with 2-4
  fragments would give the port; the per-fragment damage at that range is worth a look.
- **C1's near step, partial: 3 of 3 spared** (the victim placed at x 1571.5 settled at 1573.39, 1573.39 and 1579.58 --
  dv 7.4 / 7.4 / 13.6; the grenade rolled to dg 47.7 / 49.2 / 47.5; 55.1-61.0 u; no health changed). Cut-offs 11.67 /
  11.63 / 12.87: line 1's end under ~11.6 -- which the root stand-in (11.48) also satisfies, so it agrees with the
  placeholder without testing it. The deciding retake (the burst at dg 60-66, a cut-off of 11.3-11.4, with an open
  control at ~70 u) is the rig's first item at its next start (the main controller's order).
- **The bracket tonight** (line 1's end on a standing body, over the feet): under ~11.6 (the near step), under 13.1
  (D4's 7 clean throws), under 13.3 (the far step). It exists (D4, the far step, beside the open control). The root
  stand-in, 11.48, lies inside: `BLAST_LINE1_END_PLACEHOLDER` ships named with that bracket.
- **The tool's note**: in a new match the pool moved (`0x013d4ee0` -> `0x013f2410` on the thrower's console) and the
  flags gained a high bit (`0x400180e`, `0x400000d`): the detonation frame is read as `flags & 0xffff == 0x000d`.
- **C1's baseline** (open ground, MP2; not a ladder rung): a Terrorist victim standing 33.4 u and 33.1 u from the two
  bursts, killed outright both times (every part to 0 but the head, 8 -> 8). 2 of 2 damaged.

- **The rig's night two (2026-11-13, MP6's open yard; natural throws; the victim a standing Terrorist; reads only).**
  - *The node at the detonation frame* (3 throws): the round's `+0x20` node at the rest point (the floor + 0.12), ~0.98
    under the lifted `+0x48` -- GetDamage's falloff is measured from the rest point, as `agent/blast-lift`'s fold has it.
  - *The ~70 u open control*: 2 of 3 hurt, each by one fragment taking one part outright (a leg 30 -> 0); the third none.
  - *The distance ladder* (parts zeroed, each one fragment's work; a body hit caps the four limbs with it): 30 u 6 / 6 / 6
    (killed); 45 u 2 / 5 / 5 (2 fragments each: a body hit is 5 parts); 60 u 2 / 1 / 2 on one accumulating life; 70 u
    0 / 1 / 1-2; 75 u 0 / 1 / 1 (the head, a death); 90 u void (the victim slid off a ledge). Every hit zeroed its part --
    the falloff full to 75, as GetDamage reads -- and no change came on a landing frame (no knock-down without a death).
  - *Against the count*: the original's count (FRAG-COUNT: 8 plus the extra only within 30 u; past it the extra alone x
    900 / d^2) gives 9-15 at 30, 0-4 at 45, 0-2 at 60, 0-1 at 70-75 -- the ladder's; the port's old count (the 8 at every
    distance) would have put 2-4 fragments on every throw at 60-75 u. The earlier "armour only at 60 u" (the first
    control) reads as the tool's old seven-value misread, since named (`+0x1014` the head's maximum, `+0x1044` the overall
    health fraction): LATER 996 closes on the count.
  - *C1's near step, revised* (5 throws, all spared; the victim at x 1573.4-1579.7, dv 7.4-13.7 from the near face; the
    burst at dg 58.6-70.6): cut-offs (the rig's flat T = 10.25) 12.03 / 11.70 / 11.38 / 11.34 / 12.30; on the disc's hull, whose cap slopes to ~10.22 at the crossing, throws 3 and 4 are 11.346 and 11.313 (`blastLine1` bisected on MP6's grid, LINE1-END's review). With the ~70 u control hurting 2 of 3, throws
    3 and 4 (cut-offs 11.346 and 11.313 on the hull, where the port with the root stand-in 11.48 would hurt; their bursts (1506.02, 31.10, 2016.63) and (1504.14, 31.10, 2016.76), the feet both (1573.39, 30, 2017.50)) are line-1 results, read
    with the count's chance of no fragment at ~68 u (about 18 % a throw; 17.6 % and 21.2 % at throws 3 and 4's lifted distances, both 3.7 %): line 1's end on a standing body most likely
    under ~11.3 -- the placeholder's narrowing, LATER 991's next step.

## 11. The blast point's lift (LATER 992; `agent/blast-lift`, 2026-11-13; simulation track, reading, pending review)

**The reading.** The round's detonation `FUN_003c8330` sets the state to 5 (D:L319184), plays the record's effects at the
round's point (`FUN_00272bb0(.., 1, 5, round+0x48)`, D:L319246), sorts the target list (`FUN_003c7af0`, D:L319251; the
list itself was filled in state 3 by `FUN_0031dc90`, D:L316805 / D:L320416, which copies the point, D:L219822-219824),
sets the state again (D:L319265) and, last, lifts the point: `round+0x4c += 1.0` (D:L319266), unconditional. Both
projectile updaters run it on state 4 -- `FUN_003c5310` (D:L316877) and `FUN_003c9fb0` (D:L320105), the one that counts
online; the `+0x54` -> `+0x48` copy and the state-5 line-1 queue are in `FUN_003ca5a0` (D:L320292-320297), not
`FUN_003c9fb0` (corrected 2026-11-15 by 8f's second read of research 430, at the bytes). The round's node (`+0x20`, its `+0x30`) is not moved with it in state 5 (the pool class returns before
`FUN_003cabe0`, whose node move runs in state 6 only, D:L320102 / D:L320557; the placed class never moves it from
`+0x48`). So on the following frames state 5's walk (`FUN_003c7dd0`, D:L316866 / D:L320094) reads two points:
- **the lifted `+0x48`**: line 1 (`FUN_003c7ee0` D:L319056), line 2 (`FUN_005ac070` D:L464853), the body handler's
  radius factor (`FUN_005a0e70` D:L459214-459226), the fragment count (`FUN_005a18b0` D:L459417), the flash (D:L459228)
  and the knock's origin (D:L459281);
- **the unlifted point**: the effects, the target list, and `GetDamage` (`FUN_003c7600` D:L318711-318716), which measures
  from the node -- each fragment's damage (D:L459241, D:L459270), the knock's size, a resting charge's base, the scene's
  damage, and the claymore's and the backblast's cones.
Every round that passes state 4 lifts: a fuse at rest, an impact, an air burst; the grenades, launched rounds, C4, the
claymore, a scene program's `FIRE_WEAPON` round and the bomb's (each a pool round counted by `FUN_003c9fb0`, research 332
s1.2, research 386 s3.2) -- but a placed round attached to an object (`+0xc8`, from the placement, D:L474014-474020) has
its `+0x48` rewritten from the object every frame before the state-5 walk (D:L316850-316859), which undoes the lift for
its line 2; whether the port's surface-planted C4 is such a round is unread (note only). The lift is in world y,
whatever face the round struck.

**The target list's order** (re-read 2026-11-13): `FUN_003c7af0` (D:L318868-318925), run on the list before the walk, is
not a sort by distance: a partition by the node's `+0xa1` bit 2 with an early stop -- the walk passes the entries whose
node has bit 2 set and bit 3 clear (D:L318893-318908); at the first other entry it swaps in the next later entry whose
node has bit 2 set (bit 3 tested on the entry displaced, not the one moved forward) and stops for good when there is
none or when the displaced entry has bit 3 set (the bits the redirect at D:L318983-318986 tests); it also opens a 10 u query at the point
(`FUN_0031df50(10.0, ..., +0x48)`, D:L318876; unread, probably the effects'). So the first of a SEAL's nodes in the list --
line 1's end -- is the sphere query's own order after that partition: unread, the line-1 placeholder's stated unknown.

**Measured support.** The Shadow rig, r0004: two natural M67 throws on MP2, each resting at the floor + 0.1 and its
`+0x48` y up by exactly 1.0 on the detonation frame (s10). n = 2; not measured: an impact, an air burst, any other round.

**Built.** `BLAST_POINT_LIFT_READING` = 1 and `blastPoint` (viewer `net/blast.ts`). The room's three blast entries --
`blast`, `fireSceneRounds`, `bombBlast` -- pass the round's own point; each consumer lifts where the original reads the
lifted `+0x48`: `blastPlayers` and `blastHostages` (both lines, and `resolveBlast`'s radius factor, count and knock
origin from the lifted point, its falloff from the node: `resolveBlast`'s `node`; the flash), `blastCharges` (the line;
the distance and base from the node), `sceneBlast` (line 1; `blastAt`'s falloff and cone from the node). The page's own
no-room blast (`grenade.ts` `explode`, offline) the same: the scene's lines and the flash from the lifted point, the
falloff, the cone, the effects, scorch and smoke at the point it went off. Was (d62ce954bf, the review's F1, FAIL): the
falloff from the lifted point too. Held by match
`test/roomBlastLift.test.ts` (a 2.4-high METAL_THICK lip at x 10 shelters a SEAL at 60 from the rest point, not from the
lifted point; red on the base).

**Every offset already on a blast's point (the controller's caution 1: no double lift).**
- *A resting grenade at the floor + 0.1* (`BOUNCE_LIFT`, `../../packages/scene/src/projectile.ts`): the projectile's rest
  height, which the rig reads (rest at the floor + 0.1) -- kept; the lift is added on it (the floor + 1.1).
- *`sightFrom`'s 0.1 toward the end point* (`room.ts` `IMPACT_SIGHT_READING`; the page's copy in `explode`): a line's start
  stepped off the surface a launched round struck (`HandleImpact` 0x3c8920) -- along the line, not in y, so on a wall it
  still matters after the lift -- kept, not a stand-in for this lift. *Removed 2026-11-15 (WM-29, research 430, 8f's read
  at the bytes):* every blast line starts at the lifted `+0x48` with no further offset, an impact's point being the
  intersection itself; a resting round within 0.1 of a wall had started its lines past the wall's face. The page's
  copy in `explode` the same (research 430 s3).
- *The resting charges' own points* (`blastCharges`' targets): a target's point, not a blast's -- unchanged.
- *The bomb's point* (`BombAuthority`'s `detonated` position) and *a `FIRE_WEAPON` round's* (`Room.sceneRound`: the node's
  world matrix through the command's offset): no offset of their own -- lifted now.
- *The tests' blast points*: the dev-disc matrix and the census pass their own points to `blastPlayers` (`REST_LIFT` = 1,
  "the floor + 1") and never pass through `blast`: unchanged, a stand-in close to the lifted point (the floor + 1.1).

**The Crossroads base round (the controller's caution 2).** Research 386 s3.2's terrorist-base round (`FIRE_WEAPON
MPBOMB` at the `healthy` node, 0.5 under the floor) is a pool round counted by `FUN_003c9fb0`, so it passes state 4 and is
lifted to 0.5 OVER the floor in the original. That case was the port's evidence for one-sidedness (`blastSeen`'s note:
"Was two-sided: Crossroads' terrorist base's round, 0.5 u under the floor, reached no body"): with the lift it reaches
bodies under either rule, so it no longer tells one-sided from two-sided. The one-sided rule now rests on research 281
s4.3's reading of mode 0x20 alone; capture F3 (H421) is what settles it. Not changed here. Measured on the port's side
(probe `crprobe`, b0's box, 2026-11-13, at f2e9dcac7c): the node (526.023, 13.812, 1523.773), the placed body's feet
(526.023, 15.812, 1363.773); from the node both lines cross one admitted face, `terrorist_tent` ASPHALT at y 14.312, from
its back (open one-sided, shut two-sided); from the node + 1.0 they cross none -- open under either rule. The pins
(`sceneRoundsCrossroads.devdisc.test.ts`, the browser `crossroadsBaseRound.spec.ts`) are run on a box both ways and
reported in the task's record. *2026-11-13 (CROSSROADS-GROUND):* that placed body floated -- its feet at the node's
y + 2 over a column whose only surface is y 0 -- and the browser spec, grounding it there, went red at v0421 5b5e6ee90d
once line 1 landed: from the node + 1.0 line 1 to a grounded body 160 u south meets `terrorist_tent`'s ASPHALT top
(y 14.312, PENETRATION 0) for any end up to 12.75 over the feet (open from 12.80; this note's s10 bracket tops at 11.35),
so the original spares him by this reading (pending review). The pins now stand every body on a surface: research 386
s3.2 has the spots, the cut-off and the command's byte +10 (0 on every base map; LATER 1010 for MP82's two rounds).

**A known departure** (note only): the port has no target list of its own -- a body's falloff from the node is its radius
test, as `GetDamage` is the original's (zero past the radius); the original's list (from the unlifted point) and its
radius factor (from the lifted point, already in the port's `resolveBlast`) agree with it but for a body whose feet stand
within 1.0 of the radius's edge.


## 12. What the fragment count's posture reads (FRAG-COUNT-STANCE, 2026-11-13; simulation track, reading, pending review)

The v0.4.21 close review's finding (the room's reviewer; the same difference LATER 980 fixed for the bullet deaths,
research 421 s14). **The original** (D, source inspection of the r0001 decompilation): the count `FUN_005a18b0` takes
its crouched / prone subtraction (one fewer crouched, three fewer prone; skipped for category 0x51, the shotguns,
D:L459453-459454) from `FUN_0058a720(actor, 0)` (D:L459455-459461). With a second argument of 0 that routine returns the
actor's raw stance word, the byte at `+0x174` (D:L446840-446842), at once -- none of the death pick's mapping
(`FUN_005a0700`'s 8 / 9 / 10 and the transitions' phase rule, research 421 s14) runs on this path: a word of 1 takes one
off, 2 three, anything else none. The word reads 1, crouched, on a crouch-running SEAL (research 421 s14: measured on
the original, n = 5). **The port** passed the room's `walker.posture`, the body in use -- `stand` while a crouch runs at
full stick, the size class `FUN_0058a720(actor, 1)` reads -- so a crouch-runner in a blast took the standing count, one
fragment more than the original's. **The fix:** the room hands the walker's `stance` (the word) to `resolveBlast`
(`BlastVictim.stance`), which the count reads; the lines' ends and the knock keep the posture. Pinned by match
`test/roomBlastStanceCount.test.ts` (an M67 10 u off at draw 0.3: a crouch-runner 11 fragments, was 12; a crouch-walker
11, a standing runner 12, a prone player 9, unchanged). Not changed: the hostages' (`blastHostages`, the extraction's
posture; a hostage has no crouch run), and the blast's own death pick (`deathClip('blast', ...)` still takes the
posture; research 421 s14 keeps the blast paths apart, named for the controller). Also confirmed by reading for the
review: the bomb's own explosion lifts as the port lifts it -- `FUN_002c1c30` runs `base_explosion1` at the planted
bomb's node (D:L163919-163927, research 332), whose one `FIRE_WEAPON` makes a pool round like any scene round's
(`FUN_003c9fb0` state 4 -> `FUN_003c8330`, s11), its command's byte +10 zero on every map (research 386 s3.2).

**The blast's death pick on a transition (LATER 1014, 2026-11-19; reading, pending review; no change to the port).** The
original (D, source inspection): `FUN_0057e770`'s prone branch (D:L441003-441013) tests the low byte of the raw stance
word `+0x174` (the halfword at `actor + 0x5d * 4`) against 2 -- the word `FUN_0058a720(actor, 0)` returns, not the size
class, and with no phase rule (unlike the bullet pick's `FUN_005a0700`, research 421 s14) -- and, prone, plays the BODY
list's prone death (`FUN_005a0950(actor, 3, 2)`, when `+0xe1` bit 4 is clear); any other word throws the body
(`FUN_005807d0`, by the side the blast came from). The word's one writer is `FUN_0028dfb0` (D:L135233), reached only
from `FUN_0058a6b0` (D:L446823) -- the actor's vtable slot `+0x90`, and through a thunk (0x555290) slot `+0x14` of the
`+0x170` sub-object's table, which the play stack's pop `FUN_0028da00` (D:L135104) calls with the entry left on top
(the review's trace of the ELF's tables; a push, `FUN_0028dc90`, stores only the entry's `+0x2b`, D:L135202). Two
writes make the word prone where it matters: **at the press** the stance dispatcher `FUN_00552d60` calls the press and
then `FUN_00581ed0(actor, 2)` (D:L418896; crouch D:L418901, stand D:L418906), whose first act is vtable `+0x90`
(D:L442697), so the word is the target from the press frame; and **inside the blast handler, before the test**,
`FUN_0058a4d0(actor, 0)` (D:L440997) pops down to a base play (1, 0x12 or 0x1a, D:L446763-446765), each pop rewriting
the word from the entry left on top -- stand -> prone and crouch -> prone fall back to 0x1a (posture 2, prone), prone ->
stand to the bottom play, prone -> crouch to 0x12 (posture 1). **The port** hands the pick the walker's
`posture`; its `stance` is the word, written at the press. The two differ only on a crouch run (word crouch, body stand:
neither prone); on every transition the posture follows the word at once (viewer `mover.ts`, the stance setter and
`locomote`), so `posture === 'prone'` exactly when `stance === 'prone'`, and a pick that asks only "prone?" is the
original's either way. No change: match `test/roomBlastStanceDeath.test.ts` pins it (a kill on the press tick, the
transition's clip playing: just pressed prone, the prone death; just pressed up, thrown; and the invariant over six
transitions, which holds by construction -- every stance write goes through the walker's setter). Named, not read: in
deep water the prone press queues a crouch while the dispatcher still calls `FUN_00581ed0(actor, 2)`, so the original's
word may read prone for a frame where the port's water demotion makes it crouched.
