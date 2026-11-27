# 431 -- A mark whose clip keeps nothing: no mark (WM-20, the floating bullet marks by Frostfire's pipe)

- Date: 2026-11-15. Branch `agent/wm-effects-marks` (worktree `wt-wm-effects-marks`), base `origin/agent/next`
  69f343e834; the weekend mega sprint's WM-20, from the owner's weekend list (INTAKE.md :126, "IMG_8928.png: this pipe
  on frostfire's collision shows bullet holes where it shouldnt"; the picture, as INTAKE :161-162 describes it: marks
  hanging in the air beside two large bent pipes in a dark hall).
- Track: simulation (what the game draws). Status: **reading, pending review** -- section 1 is transcribed from the
  r0001 decompilation (`socom2_game.elf.decomp.c`, cited `FUN_<addr>` and `D:L<line>`) by the author, its line
  citations corrected by an independent second read at the source and at the bytes (8f's seat, 2026-11-15 about
  08:40Z: the note sound with corrections, the fix pass with findings; section 7); this lane's fresh review is owed.
  **Nothing here is measured on the original running.**
- Evidence kinds, kept apart: **(D)** source inspection of the decompilation; **(M)** the disc's data through the
  repository's readers (the MP2 fixture, `test/markNothingKeptMaps.test.ts`); **(U)** unit tests of the port
  (`test/markNothingKept.test.ts`, `test/markClip.test.ts`); **(O)** the original running -- none; **(B)** a rendered
  browser run -- owed (section 5).
- New names: `MARK_LATE_REVEAL_ADAPTATION` (a browser adaptation, section 4); `MARK_TYPE2_DEPTH_PLACEHOLDER` (note
  only, section 4). Unchanged: the clip's 4.8 (`MARK_DEPTH`), `MAX_DECALS`, `TEMP_DECAL_TRIANGLES`.

## 0. The answer

1. **The original draws nothing for a mark whose clip keeps no drawn triangle, and takes no pool entry for it** (D;
   section 1). Its only draw of a bullet mark is the clip's kept triangles.
2. **The page drew the bare square in the air instead** (U; section 2): `Fire.placeClipped` fell back to
   `squareInto` -- the square at unity -- whenever the clip kept nothing, charged the temporary pool 2 triangles for it,
   and clipped it again a few a frame for ever. Research 89 §14 recorded that fallback as the port's own, for a wall
   not drawn yet.
3. **In a match that fallback only ever met "nothing there"**: `matchMount.ts` reveals the whole world in the frame it
   builds it (every `revealWorld` and `revealProps` task run right after `setWorld` (L1134), at L1137), so a match's clip never meets a
   wall still to come. Every bare square a player saw was a mark the original does not draw.
4. **Frostfire's pipe** (M; section 3): the two bent pipes `worldmodel/short_pip1/di_pipe1_5` and
   `worldmodel/short_pip2/di_pipe1` (x 733-759, y 101-148, z 841-853 and 881-893) have a collision hull whose faces
   stand a median **15.4 units** off the drawn pipe along the face's normal (min 4.4, max 47.9; 87 of the 273 empty
   samples on each meet no drawn surface within 60 units) -- past the clip's 4.8, so the original keeps no triangle and
   shows no mark where the round stops on the hull. This rests on the pipe's visuals not being type 2 (whose depth test
   is any one vertex within 2.5, section 1); research 202 reads type 2 as the skinned visuals, and a static world pipe
   skinned is unlikely, but which visuals are type 2 is unread (`MARK_TYPE2_DEPTH_PLACEHOLDER`).
5. **The rule, for every map** (the fix): once the world is whole, a mark whose clip keeps no triangle draws nothing and
   takes no pool room and no slot of the ring of `MAX_DECALS` meshes. While the dev viewer is still revealing its world
   over frames, such a mark's frame is held (no mesh, no slot) and clipped again, and dropped if the world goes whole with nothing kept (`MARK_LATE_REVEAL_ADAPTATION`). No bare
   square is drawn in either case. The main controller accepted this rule as the reading to build to (2026-11-15
   about 07:40Z).

## 1. The original (D, reading, pending review)

- **The mark's one call.** `FUN_003d0ba0` (D:L323789-323921) has two callers, the hit path `FUN_003c8920` (D:L319421;
  research 89 §5) and `FUN_003c7af0` (D:L318879). It walks up from the hit node to the first ancestor with `+0x5e`'s
  top bit, or, with none, to the hit's top node under the world (the walk also stops at the node whose parent is the
  world `DAT_0045c380`, flagged or not, D:L323818-323824); only a chain that ends in null before meeting the world (or a null hit
  node) returns (D:L323821-323827)
  *(corrected 2026-11-24, NC-3 r2; was "none: return")*. It picks the weapon's `DecalSet` row for the hit's material
  (none: return, D:L323874-323876 and D:L323883-323885), draws the size, and calls `FUN_003139e0` once (D:L323919) with
  the hit record's normal negated (`FUN_00309180` scales `+0x10` by -1, D:L323891; research 89 §15). A second arm
  (D:L323828-323870), taken when bit 0x40 of the round record's `+4` is set, halves the size (D:L323829), needs `FUN_005aca10`
  non-zero and, for any material but PERSON, picks the row by two distance bands (squared distance under 10,000 and under
  40,000, D:L323859-323869); a hit on PERSON (`0x3fd328`) jumps to the ordinary material row (`LAB_003d0de0`,
  D:L323848-323849, D:L323872-323881), still at half size *(corrected 2026-11-24, NC-3 r7)*; it ends at the same
  call. Every early exit is a return; nothing after the call draws.
- **The walk of the node's visuals.** `FUN_003139e0` (D:L213891-213949), only when the node's `+0x5e` top bit
  is set (D:L213910; an unflagged node clips nothing itself), builds the mark's frame (`FUN_00307810` /
  `FUN_003079c0`, D:L213915 / D:L213918) and walks the visuals flagged `0x10000` (D:L213925): a type-2 visual goes to
  `FUN_003b8680` (D:L213927), any other to `FUN_003b3950` (D:L213935), which combines the frame with the node's matrix
  (D:L306483) and calls `FUN_003b3ab0` (D:L306484); the children are walked recursively, each by the same rule, only
  when no type-2 visual was seen (D:L213942-213947). There is no fallback and no square. (Other mark kinds enter here too -- `FUN_005a3280`
  D:L460209, `FUN_005a33b0` D:L460256 -- with the same clip and no unclipped quad.)
- **The kept triangle is the only entry.** `FUN_003b3ab0` tests each triangle -- facing (D:L306534: a dot of -0.01 or
  more skips it), the square's overlap (`FUN_003bf290`, called D:L306631, tested D:L306632) and each vertex
  `fabs(z) <= 4.8` (D:L306632-306635; at the bytes 0x3b3f84 / 0x3b3fa8 / 0x3b3fcc, all three must pass) -- and only
  inside that branch (D:L306636-306662) hands the triangle to `FUN_003b3800` (D:L306658), which takes the pool entry
  (`FUN_003bf1a0`, D:L306402-306407; filled and linked only if non-null, D:L306408-306419). With none kept the loop ends
  and the count 0 is returned (D:L306669), discarded by `FUN_003b3950` (D:L306484); no code after the loop builds a
  quad. The pools are taken nowhere else (`FUN_003bf1a0`'s only caller is `FUN_003b3800`, whose only caller is
  D:L306658). A clip that keeps nothing takes no entry, no slot of any kind, and draws nothing. r0004 has the same block.
- **The type-2 path the same way.** `FUN_003b8680` (D:L309396-309597) collects kept triangles and hands them to
  `FUN_003b8550` (its own pools `0x4b50a0` / `0x4b5080`, D:L309361-309366) in batches (D:L309491-309495) and at the end
  (test D:L309591, call D:L309592), each only when its count is non-zero. Its tests are not the other path's: facing at
  -0.1 (D:L309562), not -0.01; and after the overlap test a triangle passes when `DAT_003e14b8` is 0 or ANY ONE vertex's
  `fabs(z)` is at most `DAT_003e14b0` (D:L309565-309569). r0001's static data holds `DAT_003e14b0` = 2.5 (a float) and
  `DAT_003e14b8` = 1 (a byte): so a type-2 triangle is kept when any one vertex lies within 2.5 of the mark's plane -- a
  reading of the static initialisers (the second read); a write at run time and which visuals are type 2 are unread
  (`MARK_TYPE2_DEPTH_PLACEHOLDER`, section 4). This fix does not touch that path (the port has none).
- **No lateness.** The original loads the level whole before play; "a wall not drawn yet" has no counterpart in it.

## 2. The port before the fix (U)

- `Fire.placeClipped` (viewer `src/fire.ts`, at 69f343e834 L2362-2378): `kept === 0` -> `squareInto(frame, ...)`, the
  mark queued on `unclipped`, `markTriangles` charged 2; `Fire.clipLate` (L1945) re-clipped four a frame and requeued
  every miss for ever.
- The ring: `Fire.place` took a slot of the ring of `MAX_DECALS` (150) meshes, recycling the oldest, BEFORE the clip
  was known (L2320-2329), so with 150 marks standing a mark that kept nothing hid the oldest drawn one (the second
  read's finding 3). Since the fold a clip goes into a scratch geometry first and a slot is taken only for a mark that
  kept a triangle (`placeClipped`, `adoptClip`). Its RED, 6a85344ff6: 140 of 150 one-triangle marks left standing after
  10 rounds into nothing, 150 wanted.
- RED at 69f343e834 (`test/markNothingKept.test.ts`, commit 6492cdbc1b): 4 failed, 1 passed -- the bare square drawn
  for a drawn wall 6 units behind the collision face (`visible` true, `decals` 1); 100 marks standing where 75
  drawn marks (each keeping about one world triangle) and 75 undrawn ones should leave 75 (each bare square charged 2); the late-reveal pair. The
  control (a drawn wall 4 units behind, within 4.8) passed before and after.

## 3. The census on Frostfire (M)

`test/markNothingKeptMaps.test.ts` builds MP2 from the fixture as a match does (every reveal run), takes every
collision polygon a round may stop on (`roundAdmits`, `PENETRATION` below 1) whose material has a `BULLET_MARK_SMALL`
row, and asks the clip (a 1.5-unit square, along the polygon's normal either way) whether it keeps a drawn triangle --
at each polygon's centre, and at points 4 units apart over each face (at most 12 steps a fan triangle's side). Counts as
the run of 2026-11-15 printed them:

| measure | value |
|---|---|
| strikable polygons with a mark row | 2,971 (2,473,946 square units) |
| ... whose centre keeps nothing | 27 (69,218 sq. units): METAL_THICK 25, METAL_THIN 2 |
| face samples | 262,032 |
| ... keeping nothing | 2,922 (1.1 %), about 38,731 sq. units (1.6 % of the strikable area): METAL_THICK 38,666, METAL_THIN 62, STONE 3 |

Where the empty area lies (square units, by collision node): `bigtank` 17,912; `deckv_33` 8,721; `deckv_20` 8,176;
**`short_pip2/di_pipe1` 923; `short_pip1/di_pipe1_5` 923**; the light boxes' bulbs (`lightbox=lightbox/bulbdi_1`,
`_2`) 195 and 185; the rail ramps (`rmp1`-`rmp3`, `warehouse/railramp_*`) 42-175 each; the ladders' tops
(`ladderdown`, five) 56-97 each; `barracks/bdi` 79, `deckv_28` 57, `barracks/consoledi` 25, `barracks/trashcan1` 18,
`pipeworks` 8, `t2_1` 3. These are the places the page drew a square and will now draw nothing: a player-visible change
(fewer marks), the original's. The census is a sample, not every point of every face; it is reproduced by the test.

The depth probe: from each empty sample on a probed node's faces, the nearest drawn surface along the face's normal
either way (a raycast over the drawn meshes, 60 units). Probed: the two pipes (the owner's case) and the three largest
empty areas (the fresh review's F6):

| node | empty samples | nearest drawn surface (min / median / max) | none within 60 | where |
|---|---|---|---|---|
| `short_pip1/di_pipe1_5`, `short_pip2/di_pipe1` (the same model placed twice, 40 units apart in z) | 273 each | 4.4 / 15.4 / 47.9 | 87 each | x 733-759, y 101-148, z 841-853 / 881-893 |
| `bigtank` | 1,820 | 0.0 / 16.1 / 30.0 | 1,552 | flat at y 185, x 509-773, z 348-613 |
| `deckv_20` | 60 | -- | 60 | flat at y 100, x 669-771, z 353-440 |
| `deckv_33` | 62 | -- | 62 | flat at y 100, x 509-611, z 509-611 |

So on the pipes the drawn surface lies inside the hull past 4.8 (the owner's picture explained); on the decks and most
of the tank's top no drawn surface lies within 60 units of the collision face at all -- a collision floor with nothing
drawn on it near, where the original keeps nothing either. A minimum under 4.8 with nothing kept (the pipes' 4.4, the
tank's 0.0) is the facing or the overlap test refusing, not the depth: a drawn face there turned away from the round,
or not meeting the square. **Open (F6):** whether the port's clipper sees every drawn triangle the original's node walk
does there (an LOD band, a draw the clip skips: section 6) is not settled by this census; the rendered check at the
pipes and the tank's top (section 5) and the rig frame (Q-leg ordered 2026-11-15) settle it. Until then the
player-visible change -- about 1.6 percent of Frostfire's strikable area takes no mark -- is a reading, most of it on
the tank's top and the two decks.

## 4. Readings, placeholders and adaptations

| name | value | the game | status |
|---|---|---|---|
| `MARK_LATE_REVEAL_ADAPTATION` (`markClip.ts` `MarkClipper.worldWhole`; `fire.ts` `placeClipped`, `clipLate`; `main.ts` `show`) | the dev viewer's world not whole until its props' reveal is done: a mark whose clip keeps nothing is held as its frame alone (no mesh, no slot of the ring; not bounded by the 150, dropped when the world goes whole) and clipped again four a frame | none: the original loads the level whole before play. A browser adaptation of the dev viewer's frame-spread reveal; it never draws what the original would not (no bare square) and a match never meets it (`matchMount.ts` reveals at once) | adaptation |
| `MARK_TYPE2_DEPTH_PLACEHOLDER` | -- | `FUN_003b8680`'s tests for a type-2 visual: facing at -0.1 (D:L309562); kept when `DAT_003e14b8` is 0 or any one vertex's `fabs(z)` <= `DAT_003e14b0` (D:L309565-309569); r0001's static initialisers give 2.5 and 1 (the second read; a reading). Unread: any write at run time, and which visuals are type 2 (the loader's types). The port has no type-2 path. Settled by those two reads | note only |

## 5. Verification

- (U) `test/markNothingKept.test.ts`: RED 4 failed / 1 passed at 69f343e834; green after the fix. `test/markClip.test.ts`'s
  "a wall drawn late" now runs under the adaptation (held as a frame, then clipped), was "the bare square until the wall is
  drawn".
- (M) `test/markNothingKeptMaps.test.ts` (skips without the MP2 fixture): the census above; it asserts the two pipes'
  empty samples and their median depth past 4.8.
- (B) owed on Shadow PC 3's lock: a rendered Frostfire check at the pipes and on the big tank's top, with screenshots; and LATER 453's
  `e2e/marksOnPanes.spec.ts`, whose `test.fixme` stays until its rendered run has passed on the bench (the second read's
  finding 4): the fixme is removed in the commit that records that run.
- (O) "proven" would need a frame of the original at the pipe (Shadow PC 1's rig).

## 6. Left open

- The footprints (`effects.ts` `footfall`, L676) and the grenade's scorch (`grenade.ts`, its own `clipLate`,
  `squareEntries`) keep the same bare-square fallback; research 89 §5 already names the scorch's as the viewer's own.
  The original's other mark kinds go through the same clip with no unclipped quad (section 1). Out of WM-20's scope
  (the brief keeps the scorches' own rules out): LATER 1073.
- The original clips only against the visuals of the flagged nodes in the walk's node's subtree (the hit node's marked
  ancestor, else its top node under the world, section 1's correction NC-3 r2): a node's own visuals only if its
  `+0x5e` top bit is set (D:L213910), and its children, recursively, only when none of the visuals it walked (flagged
  `0x10000`, at a flagged node) was type 2 -- always, at an unflagged node (D:L213908, D:L213925-213928,
  D:L213942-213947);
  the port clips against every drawn mesh under the world's root (its node rule, research 89 §14), so beside a drawn
  surface of another node the port may keep triangles the original would not. Outside WM-20; a LATER candidate (its
  number to be claimed through the controller).
- LATER 589 (`NODE_OFF_MARKS_READING`): the decal list's draw site is not read here; the reading stays as it is.
- A world draw hidden after the world is whole (an LOD band, a node switched off, the dev viewer's Geometry toggle) is
  not drawn under a new mark; the original walks its node's visuals whatever its LOD. Not observed on the maps; not
  settled here.

## 7. Reviews

- The independent second read (8f's seat, 2026-11-15 about 08:40Z; a fresh reviewer that wrote none of this; by reading
  the r0001 source and decoding the branch in the r0001 and r0004 executables; no test run): `D:\s2u\seats\research-431-second-read-ce23b6f43.md` on
  Shadow PC 3 (11,144 bytes, sha256 fee43afd3da9a9ed9bb08c8b76437ade45c11d81034213af9c94e9bd59f2f439). Folded: the line
  citations (its correction 1), the type-2 constants and facing (2), the ring slot (3, with its RED), the spec's fixme
  put back (4), its notes 5-7.
- This lane's fresh review of the task (a `reviewer` agent, up to b377e45a48): PASS WITH FINDINGS, medium; every
  citation re-read at the source (its corrections agree with the second read's), the census reproduced exactly. Its F1-F3
  are the second read's 3, 1 and 4 (folded); F4 (the pool test's comment), F5 (the pipe's type-2 dependency), F6 (the
  tank and decks unprobed: probed above, left open) and F7 (L1137) folded. Recorded on `agent/wm-effects-records`.
