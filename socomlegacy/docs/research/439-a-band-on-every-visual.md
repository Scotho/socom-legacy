# 439 -- A band on every visual: Blizzard's fog plug and the LOD the port reads by name

- Date: 2026-11-16. Branch `agent/wm-effects-fogplug` (worktree `wt-wm-effects-fogplug`), base `origin/agent/next`
  4853eae49f (v0.4.24's code); the weekend mega sprint's effects lane, at the main controller's word (97c41b24, relayed
  ~20:2xZ; the controller since 20:27Z a36e1735), from the bugs intake after v0.4.23, item 4
  (`agent-mail/handoffs/bugs-intake-v0423-2026-11-16.md`, written by the owner's hub session; its own reading was
  "pending review" and is re-read here at the source).
- Track: simulation (what the game draws). Status: **reading, pending review** -- section 1 is transcribed from the r0001
  decompilation (`socom2_game.elf.decomp.c`, cited `FUN_<addr>` and `D:L<line>`, never pasted) by the author; section 3
  is the disc through the repository's readers. A fresh reviewer who re-reads both at the source is owed (section 7).
  **Nothing here is measured on the original running.**
- Evidence kinds, kept apart: **(D)** source inspection of the decompilation; **(M)** the disc's data through the
  repository's readers (a throwaway census script over `Zar`/`parseZdb`/`lodBands`, run 2026-11-16 on PC 3 against
  `SOCOM_DISC`, now held by `viewer/test/lodVisualDisc.test.ts`, which reads `SOCOM_DISC` and skips without it);
  **(U)** unit tests of the port (`scene/test/lodVisual.test.ts`, `viewer/test/worldLodVisual.test.ts`); **(O)** the
  original running -- none; **(B)** a rendered browser run -- owed (section 5).
- New names (section 6): `LOD_VISUAL_BAND_READING`, `LOD_BAND_ANCHOR_READING`, `LOD_FADE_FLOOR_READING`.
  Unchanged: `LOD_LAST_KEPT_RULING` (H92; built per visual, section 2.2), `LOD_SCALE_READING`.

## 0. The answer

1. **What the owner saw** (the intake, his words): "the house at the seal spawn has a barrier. you can see it from the
   outside looking in, but not the inside looking out"; "it is not just the window, it can be seen from the door from
   the outside when open". It is Blizzard's (MP1) `alaska4d_outbuilding02/shack_good/fogplug`: two one-sided visuals
   across the shack's openings, which the original draws only from 325 units out (fully from 450), and the port draws at
   every range.
2. **The original gives every visual its own band** (D; section 1): byte 5 of the visual's 24-byte `vparams` is a
   1-based index into the world root's `LOD_Object` table (32-byte records); 0 means no band. A banded visual is drawn
   only while the camera's scaled range squared to its node's origin is inside the band, faded across the band's ramps.
3. **The game never reads `lod.rdr`** (D): no string `lod.rdr`, `LOD_Definititions` or `LOD_Connection` is in the
   executable's string table; the world root's `LOD_Object` is loaded by `FUN_003bb6b0` (D:L311135). `lod.rdr` is the
   exporter's text twin of the same bands, present on 3 multiplayer maps (MP2, MP64, MP73) and 5 campaign maps.
4. **The port reads bands only from `lod.rdr`, by model name** (`scene/src/lod.ts` `lodBands`; viewer `loadMap.ts`
   `lods()` and the props' `lod: placement.lod.get(first.modelName)`), so on the 26 maps without the file, and for the
   visuals the file does not name, nothing is banded: 216 banded visuals on the multiplayer maps (Blizzard 26) and 60 on
   the campaign maps draw at every range (M; section 3).
5. **Where both name a band, they agree** (M): on MP2 and MP73 every visual that has a byte-5 band and sits under a model
   `lod.rdr` names carries the file's band exactly (MP64's 55 names place no prototype on the map, so it shows nothing
   either way). The agreement runs one way only: 13 visuals on MP73 sit under named models with byte 5 = 0 (its barrels,
   stools, two desks' `alpha`), as do 2 on M81, 7 on M82 and 8 on M83; the port banded them by name, the original never
   bands them (byte 5 zero, drawn untested, D:L235400-235401), and now neither does the port. All were lone far-only
   bands that H92 already drew at every range, so no picture changes for them (the fresh review's F2).
5a. **A node's visuals share one fading opacity** (D; section 1): the opacity `FUN_003b7b90` scales is set once per node
   and multiplied by each banded visual in turn, so inside a ramp a node's later visuals draw fainter than its first; the
   port fades each part on its own (`LOD_NODE_FADE_SHARED_READING`, a named gap; the fresh review's F1). Outside the
   ramps -- the fog plug up close, the owner's bug -- the two are the same.
6. **The fix, for every map** (built, section 4): byte 5 and `LOD_Object` band each visual (chunk) on its own, tested at
   its node's world origin; a world-model node with a banded visual is drawn apart; `lod.rdr` is no longer a source (a
   cross-check in the tests only). H92's kept last copy is built per visual (section 2.2): the plug's NEAR edge -- the
   bug -- is outside the ruling, which only holds a far edge open.
7. **Where the port departs from the original, under the owner's ruling** (section 2.2): the far edge of a lone banded
   visual (the bed, the stove, the trunks...) is held open by H92, so those are drawn at every range where the original
   stops drawing them at 145-1200 units. That is the ruling's reach, not parity; option B goes to the owner as H475.

## 1. The draw, read (D)

- **The visual's record.** `FUN_003c3570` (D:L315511) copies the visual's `vparams` key, 0x18 bytes, to the start of the
  in-memory visual: word 0 is the flag word (bits 0/3/8/14 already read by the port, `sceneGraph.ts`), byte 7 the
  `Material_Palette` entry (already read, `visualMaterials`), and **byte 5 the band index**.
- **The table.** `FUN_003bb6b0` (D:L311135-311150) finds the world root's `LOD_Object` key (string at 0x3fc3d0), sizes a
  vector to `size >> 5` records (`FUN_003bc5b0`: stride 0x20) and reads the bytes into it. Its caller passes the world
  object's `+0x58c` (D:L217238), so the count is at world `+0x590` and the records at `+0x594`. Record layout: the five
  floats `minNearSq, minFarSq, minInvDeltaSq, maxNearSq, maxFarSq`, the far ramp's inverse delta at +20, the fade bits at
  +24 (bit 0 near ramp, bit 1 far ramp) -- as `scene/test/lod.test.ts` already reads MP2's.
- **The pass.** `FUN_003374c0` walks a node's visuals (`node+0x8c`, count `+0x88`). For each (D:L235400): byte 5 zero, it
  is drawn with no test (`LAB_003375e0`, D:L235401). Byte 5 non-zero (D:L235458-235470): the range is
  `FUN_00290aa0(camera, matrixTop + 0x30)` -- the camera's scaled range squared (`LOD_SCALE_READING`) to the translation
  row of the matrix stack's top (`PTR_DAT_003df338`, the stack popped by 0x40 at D:L174822), i.e. **the drawn node's world
  origin**, not the visual's centroid (the detail gate uses the centroid, D:L235406-235408; the band does not); the band
  is `world+0x594 + (b-1)*0x20` when `b <= world+0x590`, else none, and with no band the visual is drawn untested
  (D:L235463-235469). With a band, `FUN_003b7b90` decides; non-zero, it is drawn; zero, it is skipped (and, where the pipe's
  `+0x715` is set, the node's result byte is cleared, D:L235471-235472).
- **The test.** `FUN_003b7b90` (D:L308899-308932): outside `minNearSq < r < maxFarSq` (strict) -> 0. Neither ramp bit ->
  1, opacity untouched. Inside `[minFarSq, maxNearSq]` -> 1. Below `minFarSq` with the near bit -> opacity `*= minInv *
  (r - minNearSq)`; above `maxNearSq` with the far bit -> opacity `*= maxInv * (maxFarSq - r)`. This is the reading
  `scene/src/lod.ts` `lodOpacity` already uses (its comment on reCOM's reversed transcription stands).
- **The faded draw.** Back in `FUN_003374c0`: a visual at opacity 1 (and not alpha-flagged) is drawn in the walk; below 1
  and above 1/128 (`0.0078125`, D:L235437) it goes to the alpha pass through `FUN_003371b0`; at or below 1/128 it is not
  drawn (D:L235424-235437). The port now applies the same floor (`LOD_FADE_FLOOR_READING`).
- **One opacity per node, not per visual** (the fresh review's F1, re-read by the author): that opacity, `fStack_4`, is
  read once from the opacity stack's top before the node's visuals are walked (D:L235394) and `FUN_003b7b90` multiplies
  it in place (D:L308922, D:L308927); nothing resets it between visuals. Inside a ramp a node's visuals compound: of
  Blizzard's plug's two visuals (both band 11) at 380 u the first draws at ~0.40 and the second at ~0.16, and an
  unbanded visual after them inherits the reduced value; the floor tests the compounded value. The port fades each part
  at its own band's opacity (`LOD_NODE_FADE_SHARED_READING`, a gap, section 6).
- **Not followed here**: the executable's other LOD strings, `LOD_MULTIPLIER` (read from a parameter list at
  D:L138444) and `lodLevel` (D:L305300); neither is on the path above.
- **A second walk** `FUN_00337cd0` (D:L235618; the band test D:L235651-235668) applies the same band cull to the visuals
  it draws, discarding the fade.

## 2. The port before, and H92

### 2.1 What the port does today (source inspection, base 4853eae49f)

- `loadMap.ts` `lods()` (:1575-1585) reads `READERM.ZAR/lod.rdr` into `Map<modelName, LodBand>`; a map without it gets an
  empty map. Props take `lod: placement.lod.get(first.modelName) ?? null` (:630) -- one band for a whole prop entry; the
  lone-placement path sets `lod: null` (:583).
- `sceneGraph.ts` reads `vparams` word 0 and byte 7, never byte 5. `world.ts` (:1361-1376) bands a prop as a whole, tests
  it at its placement (`at`), and decides `last` with `lodIsLast` over copies within 5 units (`LOD_SAME_SPOT_SQ`, :364).

### 2.2 H92, read per visual

The owner's word (HUMAN_TASKS H92, 2026-10-04): "the last LOD copy **kept as now** ('leaving render as is')"; H112
(PF-29) restates it as informational. As built (`LOD_LAST_KEPT_RULING`, `lodIsLast`, `lodOpacity(..., last)`): the last
copy at a spot -- none of the other banded copies there fades in later -- is never culled or faded by its FAR edge; it
still fades in by its NEAR edge. A lone banded model (Frostfire's `chair_office`) is already "last" and kept
(`lod.test.ts` "a lone near copy asked to stay, stays").

Per visual, with the build's rule unchanged (Blizzard's shack, all three nodes at the model's origin, section 3):
- `fogplug` (band 11: in 325-450, out 1000-1001): last at its spot -> its NEAR edge applies (hidden inside 325 units,
  ramping to full at 450) -- **the owner's barrier goes**; its far edge is held open by H92 (drawn past 1001, where the
  original drops it; the plug sealing the openings far out, deep in Blizzard's fog).
- `inlod` (band 10: in 0, out 350-450): `fogplug` fades in later at the same spot -> not last -> faded out 350-450, as
  the original. So inside 325 the interior shows and the plug does not; from 450 the plug shows and the interior does not.
- the woodpile's `highwood` (13: out 170) and `addhilod` (14: out 145) step aside for `lowwood` (12: in 170, out 700),
  which is last: the near and far woodpiles stop drawing together.
- the bed (6, 7), the stove (9), the pan and pot (8), the tree trunks (3-5), the lights and doors (15, 16) are lone ->
  last -> kept at every range, as the port draws them today. The original culls them at 145-500 units.

So H92 and the fix do not collide on the bug: the bug is a near edge, which the ruling does not touch. What H92 holds open
grows from the 3 maps' named copies to every lone banded visual on every map -- by the ruling's own words ("leaving render
as is"), these are drawn as now.

**Ruled (the main controller a36e1735, 2026-11-16, ~21:0xZ): option A is built** -- `LOD_LAST_KEPT_RULING` is the owner's
standing ruling and stays as built, run per visual. **Option B** -- H92 only for the copies it was ruled on (`lod.rdr`'s
names), every other banded visual culled at its far edge as the original -- **is not applied; it goes to the owner as
HUMAN_TASKS H475** (entered by the merge seat), default A. **A departs from the original** for the lone banded visuals:
the original culls them at their far edge (145-1200 units on the maps read, most inside the fog), the port draws them at
every range. That departure is the owner's ruling, not parity, and nothing here should be read as parity for it.

## 3. The disc (M)

Run 2026-11-16 over every `RUN/*.ZDB` on the disc (34 maps), the scene graph's `models` tree (`<stem>_GEO.ZED`), each
`visuals/*/vparams` byte 5, each world root's `LOD_Object` (`<stem>.ZED`):
- **Every band index is in range** (byte 5 <= the table's count) on every map. Every `LOD_Object` key is a multiple of 32
  bytes; on every map a ramp bit is set exactly where its two ends differ (MP2's case in `lod.test.ts`, now all 34).
- **Banded visuals per map** (in parentheses: those no `lod.rdr` name covers, covered = the band's model name is a
  segment of the visual's node path): MP1 26 (26), MP10 16 (16), MP11 15 (15), MP2 17 (4), MP5 2 (2), MP51 3 (3), MP6 48
  (48), MP61 18 (18), MP62 7 (7), MP64 2 (2), MP7 19 (19), MP71 20 (20), MP72 3 (3), MP73 36 (1), MP8 1 (1), MP82 4 (4),
  MP83 5 (5), MP9 22 (22); none on MP12, MP52, MP53, MP81 -- **216 uncovered on the multiplayer maps**, the intake's
  count, map by map. Campaign: M51 13 (13), M52 17 (0), M53 9 (9), M61 7 (7), M62 19 (19), M63 16 (0), M81 36 (4), M82 46
  (8), M83 59 (0); none on M71, M72, M73 -- 60 uncovered. 276 in all.
- **How the two counts relate**: the disc holds **486 banded visuals in 34 maps** (264 multiplayer, 222 campaign); `lod.rdr`
  names the models of 210 of them (MP2 13, MP73 35; M52 17, M63 16, M81 32, M82 38, M83 59), which the port banded before
  (by name); the other **276 = 216 multiplayer + 60 campaign** it drew at every range. The fix bands all 486 from byte 5.
- **28 banded visuals sit on world-model nodes** (7 maps: MP5's coffins, MP6's upper walls, shelf and bars (12 nodes),
  MP7's `chump_house`, MP11's bulbs and flares, MP62's `labdrug`, `g35`, `posts`, M82's `beams`), which the port merged into
  its world draw; they are drawn apart now (section 4). MP6's world draw goes from 104 draws / 13,898 triangles to 92 /
  13,059 with 12 entries apart (`worldFacadeDisc.test.ts`).
- **Where both name a band, they agree on the multiplayer maps**: on MP2 and MP73 every covered visual's byte-5 band has
  `lod.rdr`'s four distances exactly (MP2's 13, MP73's 35); MP64's names place no prototype there. One way only: 13
  visuals on MP73 under named models have byte 5 = 0 (`barrel_blue_closed/barrel_good` x3, `room_desk01/alpha`,
  `room_desk02/alpha`, `barrel_blue_open/barrel_di`, `kit_benchseat/stool_parts`, `kit_stool/stool_good`, six
  `stool_parts/partN`), and 2 on M81, 7 on M82, 8 on M83 -- banded by the port's old name rule, never by the game. On the
  campaign maps 10 covered visuals differ under the path rule (M52 `footlocker_*/dis_footlocker_open` x4, M81 `armycot/vis_bunkbed` x2, M82 `chair01/alpha`, `chair02/alpha`,
  `armycot/g13` x2) -- the name rule picks a band the game does not use there; byte 5 is the game's.
- **Blizzard (MP1)**, 16 bands. The shack model `alaska4d_outbuilding02` (placed at `worldmodel/comshack`, 2313.7,
  253.2, 3270.0): `shack_good` (3 visuals, unbanded), `shack_good/inlod` (1 visual, band 10: in 0, out 350-450, far ramp),
  `shack_good/fogplug` (2 visuals, band 11: in 325-450, out 1000-1001, both ramps), all three nodes at the model's
  origin; the bed and stove are instances inside it (at 18, 9, 36 and 5.8, 9, -20.5). `woodpile1`: `lowwood` band 12 (in
  170, out 700), `highwood` 13 (out 170), `addhilod` 14 (out 145), all at its origin. Bands 1 (0-60) and 2 (60-800) are
  on every map's table and used on MP10 only.

## 4. The build (the controller's GO, ~21:0xZ; RED 8157a85b74, then the fix)

- scene: `SceneNode.visualBands` (byte 5 per visual, as `visualMaterials` reads byte 7); `parseLodObject(bytes)` -> the
  table as `LodBand`s (distances = the stored squares rooted; whether a fade ramps follows from its ends, as before);
  `visualBand(table, index)`; `PlacedModel.band` per chunk (as `cull`, `alphaPass`, `material`, `detail`); the fade floor
  `lodDrawn` / `LOD_FADE_FLOOR_READING`, used by `lodVisible` and `world.ts`'s frame.
- viewer `loadMap.ts`: the table from the world root (`lodTableOf`, `<stem>.ZED`) on every map; each chunk's band carried
  to its `LoadedMesh.lod` by the decoder; `lods()` and `Placement.lod` (the name map) gone; the props' entry `lod` left
  null (kept for hand-built maps); a world-model node with a banded visual drawn apart as a prop, as a facade node is
  (`place`'s `apart`).
- viewer `world.ts`: a prop banded per part (`part.lod ?? prop.lod`), tested at its placement's node origin
  (`LOD_BAND_ANCHOR_READING`); a banded facade (MP11's bulbs and flares) shown in its band too (visibility only: a
  flare's material has no fade twin); `lodIsLast` unchanged in rule, run over the parts.
- tools: `forgePlacementCensus.ts` and `perf/scopeDraws.ts` count a band on a part.
- Not built: one opacity per node across its visuals (`LOD_NODE_FADE_SHARED_READING`, section 1); it differs only inside a
  ramp.
- Tests: `scene/test/lodVisual.test.ts` (unit), `viewer/test/worldLodVisual.test.ts` (unit, Blizzard's numbers),
  `viewer/test/lodVisualDisc.test.ts` (dev-disc: the census per map, 486 in 34; the `lod.rdr` cross-check on MP2, MP64,
  MP73; MP1's plug, interior and woodpile; MP6's banded world-model node apart; MP2's railings and wire flares). Changed
  with the behaviour: `scene/test/lod.test.ts` (`lodVisible` is the floor, not zero), `viewer/test/loadMap.test.ts` (the
  railings' bands on the parts), `viewer/test/worldFacadeDisc.test.ts` (MP6's world draw, 12 entries apart).

## 4a. The draws (the main controller's word, 2026-11-16 ~21:3xZ; a product-track cost of the build above)

- **What it cost as first built** (bc10d645ae): the page's draws (`revealWorld + revealProps`, `main.ts`) on Blizzard rose
  1020 -> 1483 (+463, +45 percent; the look on PC 3 and `buildWorld` without a GPU agree). `world.ts` drew a banded part as
  a mesh per placement where the part had been one instanced draw for all its placements; banding per part made the
  clutter trees' trunks (bands 3/4/5, 16-26 placements, 3-4 parts each) a mesh per placement: 173 parts over 636
  placements, +463 exactly. On a capped real GPU it showed no frame cost (60 fps both); the players it would cost are on
  phones, integrated GPUs and the Xbox browser. Relay-3's frame-time pair at bc10d645ae is this section's "before".
- **The cure** (the next head): an UNRAMPED banded part (both fades a step, the ends equal: every Blizzard tree band) stays
  ONE instanced draw for all its placements, an instance outside its band put at the zero matrix (as a hidden state is:
  nothing drawn, no ray hit) and put back at the crossing, each instance tested at its own node's origin and its last-copy
  rule decided with every other band at its spot (H92 as built). A RAMPED part stays a mesh per placement, faded through
  its twin, as the `lod.rdr` copies were before: one instanced draw has one opacity, and a per-instance opacity in the
  fade twin is LATER 1136.
- **The draws per map** (`viewer/test/lodDrawsDisc.test.ts`, pinned; the base measured at 4853eae49f the same way): equal
  to the base on 22 maps (Blizzard 1020 again); under it where `lod.rdr`'s copies were a mesh per placement and are one
  instanced draw now (MP2 628 -> 589, MP73 1315 -> 1299, M81 1376 -> 1321); over it only by the named residue -- the
  ramped parts where no `lod.rdr` named them (MP9 +170, MP64 +112, MP10 +29, MP6 +13, M82 +1) and the banded world-model
  nodes drawn apart (MP62 +44, MP6 +17, MP7 +8, M82 +5, MP11 +3, MP5 +2).
- The picture: an in-band instance is drawn by the base's own instanced draw (one alpha key for the draw,
  `ALPHA_INSTANCED_KEY_ADAPTATION`; lit by its first placement's rotation, as every instanced prop part is), so an unramped
  banded part that was instanced at the base looks as it did there wherever it is in its band, and is gone where it is
  out. **One exception** (the fresh review's N1): a copy `lod.rdr` named was a mesh per placement at the base, each with
  its own far-to-near key; an unramped one is now instanced, one key for the draw. That changes nothing for an opaque
  part (MP2's `grate_midlod`, MP73's `tire2`, the rest of M81's copies) and, for an alpha-pass part, only the sort among
  overlapping translucent surfaces: M81's `chair02` and `work_desk` (one alpha-pass part at 2 placements each, band
  0/600). Keeping every banded alpha-pass part a mesh per placement instead was measured (the author's throwaway draw
  count, `buildWorld` on every map; not held by a test) and not taken: it adds draws on
  eight maps over the base (M82 +15, MP83 +7, MP2 +5, MP51 +4, MP82 +3, M61 +2, MP6 +1; M81 +2 over this head), most of them
  parts instanced at the base too -- a change of its own, offered to the controller, not made here.
- **The look's N1 frames and the controller's ruling** (2026-11-17 ~01:2xZ): M81's eight frames, head against base at the
  same poses, differ only at edges (sub-pixel, no brighter or darker bias, no filled region at the shadows) -- no
  blend-order difference; the head stands as built. **The lighting**: `world.ts` lights a prop part ONCE, its normals
  turned by the first placement's rotation (`const rotation = ... prop.matrices, 0` and `geometryOf(rotateNormals(part,
  rotation), ...)`, head :1330/:1369; at the base :1322/:1356, before the `prop.lod` branch at :1361) -- the port's
  approximation for any part drawn at several placements (the comment beside it: "a shading error of a few degrees"),
  not the original's. The base's per-placement LOD meshes shared that geometry, so a newly instanced part is lit exactly
  as it was: of the 56 parts the cure newly instances (unramped, under a model `lod.rdr` names, with two or more
  placements, on the eight maps that have the file), 35 have placements differing in rotation -- 30 of them lit parts (the other 5 unlit: `applyLighting` lights a part only when it
  is lit or the rig-everywhere view is on, `./lighting` :88), up to a half turn apart (M81 `office_desk`, 180 degrees) -- and all were already lit by their
  first placement at the base; `viewer/test/worldLodVisual.test.ts` holds the instanced draw's colours equal to the per-placement meshes'.
  The edges are most likely the instancing's own vertex arithmetic (the instance matrix applied in the shader, not baked
  into the object's matrix) -- an explanation of the look's frames, not shown by a test or a measurement (the review's L2);
  what is shown is that they are sub-pixel, edge-only and unbiased, with no filled region where a blend order would show.
- **Two viewer tests re-pinned to this build** (2026-11-17, `agent/wm-effects-fogplug-repin`; both passed at 38b6607450
  and failed at a2cbb370d8; product-track snapshots, nothing drawn changes by the re-pin).
  `viewer/test/worldInstancePrograms.test.ts` IP5 counts the world's instanced draws; by this section's rule they move
  on two fixtures, the meshes listed by name off `buildWorld` at both commits (the author's throwaway script): MP2 29 ->
  32, `grate_midlod` (14 placements, 3 parts, band in 0 out 360, unramped), a mesh per placement by `lod.rdr`'s name,
  now three instanced draws; MP6 55 -> 51, ramped byte-5 bands where the map has no `lod.rdr` making a mesh per
  placement of `mp6_tire_single` (3 placements, 2 parts, out 450-750), `mp6_light_outside` (9, out 440-540) and
  `m6_palette_5high` (2, out 240-400). Its programs after: MP2 7 -> 9, MP6 12.
  `viewer/test/forge/worldFacadeForgeDisc.test.ts` counted every `worldmodel` prop on MP7 as a facade node; section 4's
  `apart` adds a seventh, `worldmodel/chump_house` (named in section 3; facade 0, and 7 of its 12 parts banded, in 0, out 340, as the re-pin's
  throwaway listing off `loadMap` read it -- no test holds those figures, only "facade 0, a banded part"), so
  the test now counts the six facade nodes (`facade !== 0`) and asserts `chump_house` apart: not listed, placed or
  hidden by the page or the composed lobby map, as the facades.

## 5. Owed

- The look on a real GPU (PC 3 through relay-3's lock, after the HD pack run and the Crispy trial's scratch job):
  Blizzard's shack from outside at ~100 u through the open door and the window (no barrier, the interior seen), from
  inside looking out, from ~500 u (the plug shown, the interior gone) and across 325-450; the woodpile at 150 and 300;
  Frostfire's railings unchanged; Desert Glory's upper walls (790 u).
- HUMAN_TASKS H475 (H92's reach per visual, option B for the owner; default A), entered by the merge seat.
- LATER 1136 (reserved by the merge seat): a per-instance opacity in the LOD fade twin, so a ramped banded part can stay
  one instanced draw too (the residue in s4a).
- **Proven** waits for a capture of the original at Blizzard's shack (MP1, `worldmodel/comshack`, 2313.7, 253.2, 3270.0):
  the openings seen from outside up close (< 325 u: no plug) and from beyond ~450 u (the plug drawn), and the woodpile
  either side of 170 u.
- Not checked: when the port began drawing the plug (by the code, before v0.4.23).

## 6. Placeholders and readings

| Name | Value | Source | Level |
|---|---|---|---|
| `LOD_VISUAL_BAND_READING` | `vparams` byte 5, 1-based into the world root's `LOD_Object`; 0 or out of range: no band | `FUN_003c3570` D:L315511; `FUN_003374c0` D:L235400, D:L235459-235469; `FUN_003bb6b0` D:L311135-311150, D:L217238 | reading, pending review |
| `LOD_BAND_ANCHOR_READING` | the range is to the drawn node's world origin (matrix top +0x30), scaled | `FUN_003374c0` D:L235458; `FUN_00290aa0` D:L137045 | reading, pending review |
| `LOD_NODE_FADE_SHARED_READING` | the original fades a node's visuals through one opacity, scaled by each banded visual in turn (inside a ramp a later visual draws fainter); the port fades each part at its own band's opacity -- a gap, owed a build (one opacity per placement across its node's parts, in visual order) | `FUN_003374c0` D:L235394; `FUN_003b7b90` D:L308922, D:L308927 | reading, pending review (named, not built) |
| `LOD_FADE_FLOOR_READING` | `1 / 128`: a fading visual at or below it is not drawn (the pipe's overrides `+0x5f` bit 0, `+0x711`, `+0x714` unread, taken as unset in the world's walk) | `FUN_003374c0` D:L235424-235437 | reading, pending review |
| `LOD_LAST_KEPT_RULING` | unchanged (H92); built per visual (section 2.2, option A, the controller's ruling); option B for the owner, H475 | HUMAN_TASKS H92, H112, H475 | ruling (a departure from the original for lone banded visuals) |

## 7. Reviews

Owed: a fresh reviewer who re-reads section 1 at `FUN_003c3570`, `FUN_003bb6b0` (and its caller D:L217238),
`FUN_003374c0`, `FUN_003b7b90`, `FUN_00337cd0`, and re-runs section 3's census through the readers.
