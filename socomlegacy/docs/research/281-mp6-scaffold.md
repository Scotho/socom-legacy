# 281 -- MP6's X-braced scaffold: a render-only brace over a climbable face (PB-3, issue #80, H160)

- Date: 2026-10-11. PARITY-2's row PB-3 (the playtest batch's PB-3; [brief](../plans/briefs/2026-10-11-pb3-mp6-scaffold.md),
  re-cut 03:30Z). Base `92c38d0ec` on `agent/pb3`.
- Status throughout: **reading, pending review**. The disc's data was read through the repository's readers (the
  fixture `test-fixtures/RUN/MP6.ZDB`, byte-identical to the disc's `RUN/MP6.ZDB`, compared 2026-10-11), and the
  decompilation (`socom2_game.elf.decomp.c` on the owner's host, `D:L<n>`) was re-read at every line cited here.
  The port's outcomes are measured runs of the port, labelled as the port's. No capture of the original was made:
  nothing here is proven.
- The probe: `packages/viewer/test/parity/mp6Scaffold.parity.test.ts` (fixture tier; skips naming the cause without
  `MP6.ZDB`, `MOTION_P.ZAR` or `READERC.ZAR`).
- **PB-3b (2026-10-16; issue #80, PAR-21; [brief](../plans/briefs/2026-10-16-pb3b-the-climb-contact-from-the-walks-hit.md)):**
  s4.1 and s4.2 built on `agent/pb3b` (base `2b080126f`), s4.3 the read behind them. **Reading, pending review**:
  source inspection of the decompilation and of the game ELF's bytes (`game/disc/socom2_game.elf`, read only: its
  vtables and its VU0 microprogram, disassembled by the implementer's throwaway scripts outside the tree, named in
  s4.3), and unit and fixture-tier tests of the port. No capture; nothing here is proven.
- **PAR-21a (2026-10-17; PAR-21; [brief](../plans/briefs/2026-10-17-par21a-the-climb-contacts-rules.md)):** s4.1's
  first two departures built (any hit replaces the contact; the corner drop), the rest re-read and named (the weapon
  line's slot, the moving tick's drop check, the reach), and s4.3's census of the one-sided walk (no build). **Reading,
  pending review**: source inspection of the decompilation, unit and fixture-tier tests of the port, and a scratch
  census of the port's hull (not committed). No capture; nothing here is proven.

## 0. The answers

- **The brace has no collision of its own.** The crossed bars under the deck's north edge are render geometry; what
  collides there is two flat invisible quads: `worldmodel/deck_climbers` (appflags 4, a climb face) on the outside and
  `worldmodel/noclimb_invis` (appflags 0) behind it (s1).
- **Walking in does not climb.** The page's walker, stick ahead and no press, stops 3.5 off the face on either side
  and slides along it at an angle; nothing rises at the brace (s3, the port's runs).
- **The climb is an offer and a press.** From the +z side the face is an appflags-4 face at h 29.99: the original's
  offer `FUN_005b3ce0` offers the climb there (s2), the table gives the hang (`seal_stand2hang`), and the climb ends on
  the deck at 30. The owner's "climbed it by walking in" is most likely this offer taken with the press.
- **H160, restated:** does the original offer the hang on `deck_climbers`? The reading's answer is **yes, from the +z
  side**; a capture of the original at the brace (the icon, then the press) would prove it (s5).
- **Two port divergences, built by PB-3b (2026-10-16; reading, pending review):** the port takes the climb contact from
  the walk's own wall hit, as the original takes it from the move solver's, so it offers the hang mid-face too (s4.1,
  the probe's case now an `it`); and the contact is one-sided, the hit's own normal, as the original's segment query
  makes it (s4.2, read in s4.3). Was: "Two port divergences, named, handed to PAR-21 (no walker change here): walking
  or running in standing, the port offers the hang only near the face's ends, because its touch reach is shorter than
  its stand-off from this leaning face at the standing head line (s4.1, the probe's `it.fails`; crouch-walking it does
  offer mid-face); and the port's climb contact is two-sided where the original's may be one-sided (s4.2)."

## 1. The hull, off the disc

Read through `loadMap(FsAssetSource, 'RUN/MP6.ZDB')`, `groundPolygons(map.ground)` (`mover.ts`; the fields are
`m_ditype`, `m_material`, `m_cameratype`, `m_appflags` of each `worldCollision` polygon, `collision.ts` `WorldPoly`).
MP6 has 5,872 collision polygons under 398 owners; `deck_climbers` and `noclimb_invis` each own exactly one.

| polygon | owner path | ditype | appflags | material | cameratype | points (x, y, z) | normal (`polygonNormal`) |
|---|---|---|---|---|---|---|---|
| 2280 | `worldmodel/deck_climbers` | 2 | 4 | 3 | 0 | (1673.34, -0.01, 1440.80) (1709.32, -0.01, 1439.82) (1709.34, 29.99, 1440.31) (1673.35, 29.99, 1441.29) | (0.027, -0.016, 0.999): facing +z, out from under the deck |
| 2281 | `worldmodel/noclimb_invis` | 3 | 0 | 3 | 0 | (1670.71, 29.99, 1439.86) (1711.55, 29.99, 1438.75) (1710.54, 0.00, 1438.29) (1671.19, 0.00, 1439.36) | (-0.027, 0.016, -0.999): facing -z, under the deck |

- **Material 3** is `INVISIBLE_DI`: the hull's byte `i >= 2` is `materials.rdr`'s SOILS entry `i - 2`
  (`packages/scene/src/projectile.ts` `BUILTIN_MATERIALS` / `SOILS`), and SOILS[1] is `INVISIBLE_DI`. Its
  `FOOT_STEP_OFFSET` is 0 (only GRASS, BROKEN GLASS, LEAVES, ICE, SNOW and GRAVEL carry -0.8; `climb.ts`
  `footStepOffset`, research 86 s3.3).
- **Both faces lean.** `deck_climbers`' top edge stands 0.49 further out (+z) than its bottom, and the quad is turned
  0.98 in z over its 36 in x; `noclimb_invis` leans the other way. So at the walk's head line (feet + 19.394, research
  217 s2.2) `deck_climbers` stands 0.32 further out than at its foot.
- **The deck above** (the catwalk): `worldmodel/di_top1`, ditype 3, material 20 (`WOOD_THIN`), flat at y 30 over x
  1598-1830, z 1378-1440 at the brace (polygons 2284-2292, 2294, 2295, 2300). Its other polygons are not the flat top:
  2293 is the stair's ramp (below), 2297 a ramp at the west end (n_y 0.826, 30 to 50.45), 2296 a landing at 50.45 and
  2298 / 2299 the sides of that end (ditype 2). Its underside `di_bas1` at 29.5 (ditype 2); its rail
  walls `deck_dis_outside` / `deck_dis_inside` (material 3, ditype 2) from 29.5 to 43.3 along the deck's edges. The
  ground under and in front is `g346_3` / `g346_4` at 0 (material 5, `SAND`).
- **Beside it:** the deck's posts `worldmodel/di_post1` (x 1597.8-1633.6) and `di_post2` (x 1748.9-1796.9), 2.25-square
  wooden posts (material 20) from 0 to 29.5, some faces ditype 3 with n_y 0.04-0.08. They stop the walk as walls (s3).
  The deck's own way up is its stair, `di_top1`'s ramp polygon 2293 (n_y 0.837, x 1794.7-1815.7, from -0.05 at z
  1611.0 to 30 at z 1565.1).
- **MP6's climb faces**: 89 polygons with appflags 4 and 8 with appflags 5 (research 86 s3.6's counts; the probe
  re-counts them).

**The brace is render geometry.** In `LoadedMap.world`, the chunk textured `mp6_woodstairs.tif` holds two crossed bars
at x 1672.2-1709.9, z 1438.8-1440.8: one rising from y 0-1.8 at x 1672.6 to 27.0-28.8 at x 1709.9 (about 36 degrees),
the other falling across it, drawn in two halves that meet at x about 1691, y about 14-16. Over them the deck's rim
beam runs at y 26.5-29.5, z 1438-1439. No collision polygon follows a bar: the bars' sloped faces are not in the
hull, so no bar is stood on, in the original or the port. What the body meets at the brace is the two quads.

## 2. The climb offer in the original (reading, pending review)

`FUN_005b3ce0` (D:L469088), the offer, asked each frame for a type:
- it takes the kept contact (`+0x1090`, valid while `+0x10ac` is set) and its polygon's appflags, `(byte[poly + 10] &
  0x7f) >> 4` (D:L469131);
- for any type but the ladder it refuses when the facing -- the actor matrix's row `+0x20` (D:L469213) dotted with the
  contact's stored normal `+0x10..+0x18` (D:L469216) -- is under 0.3 (D:L469243);
- it runs the obstacle ray `FUN_0054e430` (D:L469246, research 86 s3.3), whose polygon replaces the contact's for the
  height;
- for appflags 4 (D:L469251) it takes h = that polygon's top + the material's `+0x38` (`FOOT_STEP_OFFSET`) - the
  actor's y (D:L469261), and returns 1 at h <= 5 (D:L469263); between 5 and 10 (D:L469266) it steps the actor itself
  (`FUN_005b2620`, D:L469274) and returns 0; above 32 it returns 0 (D:L469280); otherwise 1.

So at the brace, h = 29.99 + 0 - 0 = 29.99: the offer stands, and `FUN_00580b70`'s table (research 86 s3.3) gives
28..32 "Stand -> Hang", then "Hang", then "Hang -> Climb" onto the top. The press is needed (h is over 10). This agrees
with research 86 s3.1 / s3.3 and with the port's `climbClass` (`climb.ts`): `climbClass(29.99, 4)` is `high` /
`seal_stand2hang`, pinned by the probe. From under the deck the polygon behind is `noclimb_invis`, appflags 0: never a
climb (research 86 s3.1's table).

**The contact is dropped** (`FUN_005b3890`, D:L468959): when the actor is more than 24 from it across the ground
(D:L468986), behind its stored normal (D:L468988), or faced away from it (D:L468991). `FUN_005b0d30` (D:L467394)
stores the contact by copying a 32-byte hit slot as it is, its normal with it (the slot and its normal: s4.3).

**The floor pick takes no slope** (`FUN_005b5d40`, D:L470165): the highest candidate at or under the origin + 1
(D:L470233), refused more than 20 over the feet (D:L470273), by height alone -- as the port's `selectFloor`. It does
not bear on the brace: no bar is in the hull, and the quads are met as walls first (s3).

## 3. The port's outcomes (measured runs of the port)

Runs of the page's `Walker` (`walk.ts`) on `groundGrid` with a `Traversal` (`traversal.ts`) carrying the clips of
`MOTION_P.ZAR` / `READERC.ZAR`, on the fixture.

**Where the numbers come from.** The probe asserts the hull's facts (s1: the two quads, their fields and heights, the
89 / 8 climb-face counts, `climbClass` at 29.99), the offer and climb near the west end, the mid-face `it.fails`, the
crouch-walk's mid-face offer, the walk's stop without a press, and nothing offered from under the deck. Every other
count here -- the 5,872 polygons and 398 owners, the sweep's 24,872 walks, the offer map's 1,620 walks / 707 icons
and its per-x counts, the posts' and rubble walks -- comes from the implementer's **uncommitted throwaway scripts**
(2026-10-11, outside the tree), measured once and not held by any test. To reproduce one: load the fixture with
`loadMap(new FsAssetSource(<test-fixtures>), 'RUN/MP6.ZDB')`, build `groundGrid` / `groundPolygons`, and for each
start `place` a `Walker` with a `Traversal` driver (clips from `simClipsFromBytes`), set its yaw, tick it with the
stated stick for the stated ticks, and record its feet, `climbPrompt()` and `state().kind` -- the probe's `walkIn` /
`climbFrom` are the same loop.

The runs:

- **Straight in, no press** (x 1680, 1690, 1700; 240 ticks): from +z (yaw 0) the body stops at z 1443.7-1444.3, 3.5
  off `deck_climbers` at its head line; from under the deck (yaw 180) at z 1435.4-1435.9, 3.5 off `noclimb_invis`. The
  feet stay at 0. At +-30 degrees the body slides along the face and leaves past its ends (to the ground beyond, or a
  rubble pile `pile2` at about 5 to 7, away from the brace).
- **A sweep** of 24,872 walks (every ground point within 1 of 0 on a 4-unit grid over x 1592-1840, z 1372-1616, eight
  headings, 180 ticks, no press): no climb started anywhere, and no walk rose on `deck_climbers`, `noclimb_invis`, the
  posts or the sand walls `g373` / `g375` / `g376`. Walks rose over 6.6 only on the rubble `pile2` / `pile4`, the
  crater rim `crater1`, and the deck's stair (`di_top1` polygon 2293, 31 walks from about (1788-1800, 1612-1616) heading
  north or north-west), which ends on the deck at 30.
- **The offer** (1,620 walks from z 1450, x 1665-1718, yaw -70..70, 150 ticks, the stick full ahead, half of them
  after a crouch press -- which at a full stick is the crouch-run, `FUN_00584c60` as `mover.ts` `locomote` builds it:
  push >= 12.4 / 14.8 runs in the standing posture, so those walks held the standing head line too): the icon
  (`climbPrompt`, class `high`) showed in 707 of them, every one near the face's ends -- at x 1669.5 to 1713.2 with
  none between 1675 and 1708 (rounded x: 1670 345 times, 1671 9, 1712 92, 1713 261), z 1441.4-1443.9 -- never
  mid-face. From x 1671 straight in (yaw 0) it shows at (1670.09, 0, 1443.10)
  after 12 ticks; the press hangs the body and the stick ahead pulls it onto the deck at y 30, past the edge (the
  probe's case (a)).
- **Crouch-walking** (crouched, the stick at 0.6 or 0.8, under the crouch-run's 0.838, so the posture stays crouched;
  x 1680, 1690, 1700 straight in): the icon shows mid-face after 38-41 ticks (at x 1690, z 1444.05, 3.70 off the
  face's plane there), and the press climbs onto the deck at 30. The probe pins x 1690 as the port's.
- **From under the deck** (yaw 180, 180 +- 30): nothing is offered, and a press starts nothing. The body stops 3.5 off
  `noclimb_invis` (straight in at (1686.83, 0, 1435.54)), which puts it 4.28 short of `deck_climbers`' footprint box
  (its z starts at 1439.82): `touchClimbable`'s box reject (`climb.ts`, the `bx * bx + bz * bz > reach * reach`
  test) refuses the face at `TOUCH` 3.75, no contact is kept, and `planClimb` / `topFloor` never run. The probe asserts
  that no contact is kept there. (Were a contact kept, `topFloor` would look 4 past the edge toward +z and find only
  the ground at 0: s4.2.)

## 4. Where the port departs from the reading (named; handed to PAR-21)

### 4.1 The mid-face offer: the touch reach against the stand-off

**Built (PB-3b, 2026-10-16; reading, pending review).** The walk's slide records each wall a probe line met on the move
(`mover.ts` `WallHit`, `Walker.wallHits`: the polygon, the line -- 0 the low probe at the feet + `step_height`, 1 the
head line -- and the nearest point of the wall's cut at that line), emptied as the next tick's move begins, after the
traversal has read them. `traversal.ts` `keepContact` takes its contact from them (`climb.ts` `contactFromHits`), not
from `touchClimbable` at `TOUCH`, which is gone (`TOUCH` stays the ladder's, `touchLadder`): each line's nearest
climbable hit, then the low line's (the centre segment's), or the head line's when it is nearer and higher -- the
original's choice among the hits of its first two segment records, the centre's and the head line's (`FUN_0054aa30`
D:L415433 and D:L415537 register them in that order; `FUN_005483d0` D:L413823-413848 keeps the first and replaces it
only by a nearer hit with a higher y; each record's hit is its nearest, `FUN_002d4cc0` D:L175906-175960). The contact's
point is the hit's, not the plane at y 0. At the brace the head line's hit is the contact, 3.5 off at 19.394, and the
icon shows mid-face: the probe's case is an `it` and passes (was the `it.fails` "walked straight in mid-face, the
original offers the hang"; its RED on the base: `mid-face: expected null to be 'high'`). Its (b) pin `midFace.prompt`
null is gone (now `high`, held by that case), and (c) is re-pinned to the walk's hits: from under the deck the walk
meets `noclimb_invis` alone, so no contact (was: `touchClimbable`'s box reject at `TOUCH`). Every other climb test
of the page and the room kept its pins (the list in the PB-3b report).

What the port still departs in, named (reading, pending review). PAR-21a (2026-10-17;
[brief](../plans/briefs/2026-10-17-par21a-the-climb-contacts-rules.md)) built the first two and re-read the rest; each
item says which:
- **Any hit replaces the contact -- built (PAR-21a C1).** `FUN_005483d0` first keeps only the steep hits: a hit whose
  polygon's own normal has y over `max_slope` (`DAT_0044c268`, 0.6428; signed, so an overhang counts) or whose material
  is VOLUMETRIC or LIQUID is struck from the list (D:L413426-413457). Of the centre's and the head line's records
  (D:L413834) it stores the best hit whether or not its polygon climbs (D:L413866). The port now stores the best hit
  the walk met from its front, climbable or not (`climb.ts` `contactFromHits`, filtered by `moveHit`); a plain wall's
  contact offers nothing, as `FUN_005b3ce0` asks the contact's own appflags first (D:L469131-469132), so its obstacle ray
  is not cast; the ray's polygon serves the offer only, a named departure (the next item). RED: `traversal.test.ts` "PAR-21a C1: a crate face met, then a coplanar plain wall ..." (`expected {
  visible: true, kind: 'low', ... } to be null` on the base). [Not mirrored: a material byte of 0 is the map's
  `DefaultMaterial`, which the climb does not know; it is taken as `UNKNOWN`, no flags.] *Was:* "`FUN_005483d0` stores
  the best hit whether or not its polygon climbs (D:L413866; with no steep hit at all, the branch at D:L413618-413669
  keeps the old contact unless the new is climbable, the old is not, or the old is over 24 away -- research 86 s3.1's
  rule, which is that branch's). The port keeps its own rule that only a climbable wall the walk met replaces the
  contact: walking from a crate into a plain wall keeps the crate's contact in the port, not in the original."
- **The obstacle ray's hit is stored in the original -- a named departure (PAR-21a F1).** `FUN_0054e430`, whose one
  caller is the offer (D:L469246), casts at the contact's top + 0.5 (cast only under the feet + 19.1 + 2.0,
  D:L416744-416748) a level segment to 1.1 of the way past the contact (D:L416750-416767) through `FUN_0031e1d0`
  (D:L416772), which returns the segment's nearest hit only (`FUN_002d4cc0`, D:L220141-220143). When that hit's normal y
  is at or under `max_slope` and its material is neither VOLUMETRIC nor LIQUID (D:L416775-416791), and its collider
  (the slot's `+0x1c`) is not the stored contact's (`+0x10ac`, D:L416792), `FUN_005b0d30` stores it at
  `+0x1090..+0x10ac` (D:L416793; D:L467394-467420), keeping the stored vectors (`+0x10b0`, `+0x10bc`), and the offer goes
  on with it (D:L416794-416797). So in the original the ray's polygon replaces the contact. The port's ray serves the
  offer only (`traversal.ts` `keepContact`; was, before PAR-21a: it replaced the kept contact): under C1 a stored plain
  wall behind a ledge would end a still body's offer, since the port's still body casts nothing to re-hit the face,
  where the original's local still body casts its records along the facing (research 217 s2.1) and its move stores the
  face again. It closes with the segment records (PAR-21, `WALL_PROBE_READING`, the reach below). Also not as the
  original: the port's `obstacleRay` passes over a hit on the contact's own owner or a rejected one to the next
  (`climb.ts`), where `FUN_0054e430` asks the nearest hit alone -- among them a downward face steeper than about 44
  degrees (normal y under -0.714), which passes the original's filter and is stored there, but which the port's
  `contactOf` refuses as no wall (its horizontal part under 0.7), so the port's ray looks past it (PAR-21a N1); and when the contact polygon gives no top
  (`FUN_002dbfb0` returns 0) the original casts the ray at the head's height instead -- the head node's y
  (`FUN_002869d0` on `+0x308`) over the feet -- if the stored hit point's y is under it less 0.1 (D:L416735-416743),
  a branch the port does not model (named only; PAR-21a's re-review). The ray's filter is the original's since the
  re-review: a hit's own normal y at or under `max_slope`, signed, and no VOLUMETRIC or LIQUID material
  (D:L416775-416791, `moveHit`; was `|n_y|` and water only), held by `traversal.test.ts`'s foliage case (a BUSH_VOL
  wall at the ledge's top is refused, the crate's climb offered) and overhang case (a face at normal y -0.68 behind the
  ledge is admitted, no plan) -- PAR-21a F6, each red on the old filter.
- **The branch with no steep hit is the weapon line's, not the move's wall -- named, not built.** With no steep hit
  (D:L413618-413671) the candidate is the slot at `actor+0x1140`, which `FUN_005b0c70` writes (D:L467345-467365):
  `FUN_0054d9a0` clears it as the tick begins (D:L416434) and, for the local player while `+0x1340` is 0, fills it with
  the nearest non-VOLUMETRIC, non-LIQUID polygon of any slope on `FUN_0054e8f0`'s segment -- along the facing, twice the
  held weapon's length, plus the velocity (D:L416858-416910) -- through `FUN_0031e160` (D:L416630-416687). That slot
  replaces the contact when it climbs (or is a ladder, D:L413634-413636), when the old contact does not, or when the old
  is more than 24 away across the ground (D:L413644-413668); with no slot, a moving tick runs the drop check
  (D:L413624). The port has no weapon line: a tick with no wall hit keeps the contact under `contactHolds`.
- **The corner drop -- built (PAR-21a C2).** When the stored hit is climbable (`FUN_0059d9f0`: appflags 1, 3, 4, 5,
  D:L457424-457426), any other hit of the move -- of every record, the side segments too (the loop at D:L413880) -- on
  a different polygon (the slot's polygon word `+0xc`, D:L413884) whose horizontal normal (y zeroed, renormalised,
  D:L413869-413893) dotted with the stored one's is under 0.9 (the literal at D:L413894, about 25.84 degrees; not an
  absolute value, so a face turned the other way drops it too) clears the contact (`FUN_005b0d30(actor, 0)` ->
  `FUN_005b3890(actor, 1)`, D:L413895, D:L467399-467400, D:L468981-468982): at an inside corner nothing is offered. The
  port's `climb.ts` `cornerDrop`: the walk's other hits met from their front -- the front test stands for the one-sided
  query (s4.3); without it the slide's hit on `noclimb_invis` from behind (dot -1) would clear `deck_climbers`' contact
  near its ends. RED: `traversal.test.ts` "PAR-21a C2: an inside corner of two crate faces ..." (30 and 90 degrees:
  `expected 'low' to be null` on the base) and `climbFacing.test.ts` "(e2) PAR-21a C2: held in the inside corner with
  prop01 ..." (`yaw 30, right 0: nothing offered in the corner: expected 'low' to be null` on the base). **Named
  departures:** the port's other hits are those of its two probe lines (the slide's disc at the stand-off 3.5), not
  the original's four segment records (the centre, the head line and the side segments 0.3 r to 1.2 r across,
  `FUN_0054aa30` D:L415433-415577); so walked straight into Frostfire's inside corner at 0 degrees the port's slide
  grazes `prop01` on its first tick only and then meets `prop02` alone, and still offers `prop02` (pinned as the
  port's own in "(e2)"). Whether the original's left side segment keeps meeting `prop01` there depends on its stand-off,
  which is its reach (the next items, C3), unread: at the port's resting spot (x 937.9, z 781.6), still, that segment
  (from 1.05 to 4.2 left, 4.9 ahead) meets `prop02`'s south face first (t 0.714) and crosses `prop01`'s plane at about
  z 777.2-777.8, outside its span (778.1-795.2), so only a body standing about 0.3 or more further back meets `prop01`
  (PAR-21a F4). And of the other hits only a face the walker stands within the span of counts (`CORNER_HITS_READING`
  `'span'`, s6) -- **two readings, unsettled (parity clause 7; HUMAN_TASKS H229)**. At an outside corner the port's
  disc meets both faces at their shared end. At Frostfire's `prop02` north-west corner at -120 (from (919.75, 759.22)):
  with no velocity the side segments end at (926.09, 758.03) and (921.89, 765.31), short of both faces' spans, and only
  the centre meets the corner -- `'span'`'s outcome, the climb offered. But the side records add the velocity to their
  ends (D:L415566, D:L415806; the per-tick displacement, D:L413918): at about 1.05 a tick or more (a full run is about
  2.17) the left record's end, 921.89 + 0.866 v, crosses the west face's plane (x 922.8) at about z 765, inside its span
  (761-778.1); the moving centre meets the north face first, so the west face is another hit at dot 0 and the original
  clears the contact -- `'any'`'s outcome (PAR-21a F2). Where the original's body stands when it meets the corner is its
  stand-off, its reach (C3), unread. `'span'` is the controller's choice between the two, kept because it keeps the
  existing pin (`climbFacing.test.ts` (e) at -120 climbs), pending a capture (H229); the faithful rule, the side records
  cast for the corner's other hits, goes to PAR-21 with C3. *Was:* "When the stored hit is climbable (`FUN_0059d9f0`), any other hit of the move on a
  different polygon whose horizontal normal is off by more than about 25.8 degrees (dot < 0.9) drops the contact
  (D:L413867-413897, `FUN_005b0d30(actor, 0)` -> `FUN_005b3890(actor, 1)`): at an inside corner the original offers no
  climb. The port asks no other hit (climbFacing's inside-corner case with `prop01` climbs; the port's, measured)."
- **The drop check on a moving tick only -- named, not built.** The original runs `FUN_005b3890(actor, 0)` (24 across
  the ground, behind the stored normal, faced away) only on a moving tick (`bVar7`: the velocity's square over 2e-5,
  D:L413459-413461) with no steep hit and no weapon-line slot (D:L413624) or with steep hits but none from the first two
  records (D:L413860); the port runs `contactHolds` every tick. Not built: other per-tick paths drop the contact
  regardless of the motion -- `FUN_0054a3d0`, run each tick by `FUN_0054d9a0` (D:L416616-416628) while the prone gate's
  obstacle slot `+0x1120` (`FUN_005b0bb0`, written at D:L416352) is set, clears it whenever its push changes the
  velocity (D:L414380); and `FUN_00582540` at the end of clip 0x2c (D:L443005) and the climb's end handler
  `FUN_00589aa0` (D:L446721, D:L446724) run the check too. The other callers clear it unconditionally on a climb's start
  or a state change (D:L431148, D:L431251, D:L431617, D:L446556, D:L469275, D:L469665, D:L514584, D:L514589).
- **The reach -- not built (handed to PAR-21 with `WALL_PROBE_READING`).** The original's segments meet a wall before
  the body does (the centre 5.39 ahead still, 9.43 moving, the head line `r x 1.4` = 4.9 plus the velocity, research 217
  s2.1), and a record's hit is the slide itself: every steep hit's horizontalised normal takes the velocity's part along
  it away (D:L413538-413568), and for the local player the deepest segment end more than 1 past its plane pushes the
  velocity back by the depth less 1 (D:L413573-413615). So the contact's reach and the stand-off are one thing; casting
  the contact at the records' reach while the port's slide still holds the body 3.5 off would part them. The port's
  slide meets a wall at the stand-off 3.5, so the icon shows when the body touches, not up to a few units sooner; a
  still body casts nothing in the port (the local player's still body casts along the facing, D:L415135-415150).
- **The distance gate** is the original's: none but `FUN_005b3890`'s 24 across the ground (D:L468986), as before.

Was (the section as PB-3 wrote it):

Mid-face, the walk holds the body 3.5 off the face at its head line (19.394), where `deck_climbers` stands 0.32
further out than at its foot. The port's contact (`climb.ts` `contactOf`) is measured to the plane through the quad's
first point, at y 0, so the body is 3.82 from it -- past `traversal.ts`'s `TOUCH` (`BODY_RADIUS` + 0.25 = 3.75), and
`touchClimbable` keeps no contact: no icon. Crouch-walking, the head line is at 12.138, where the face stands only
0.198 out: the body stops 3.70 off, inside the reach, and the icon shows mid-face (s3) -- the cause is the head line's
height against the lean, so it bites standing and running (and the crouch-run, which takes the standing posture),
not crouch-walking. Near the ends the walk's slide brings the body within 3.75 of the corner,
and the offer shows. The original keeps the contact from the move solver's own hit (`FUN_005483d0`, research 86 s3.1),
with no such reach, so by the reading it offers the hang mid-face too. The probe holds this as an `it.fails` ("walked
straight in mid-face, the original offers the hang"). What settles it: the port taking its contact from the walk's
own wall hit, as the original does (PAR-21), or a capture of the original walked straight into the brace (the icon or
not).

### 4.2 The contact's side (open)

**Built (PB-3b, 2026-10-16; reading, pending review):** the hit's normal is the polygon's own and the hull's segment
query is one-sided (s4.3), so `contactOf` no longer turns the normal: a wall seen from behind its own normal is no
contact (null), and `obstacleRay` passes over such a hit to the next. A synthetic test holds it (`traversal.test.ts`,
"a climb face met from behind its own normal offers nothing; wound to face the walker, the same face offers the
climb": the box's far side wound into the box, walked into from outside -- RED on the two-sided base `expected 'low'
to be null`; wound outward, `low`). At MP6 the outcome does not change (s3: nothing from under the deck). Was (the
section as PB-3 wrote it, the side open):

`FUN_005b3890` drops the contact when the actor is behind its stored normal (D:L468988), and `FUN_005b0d30` copies the
hit slot's normal as stored (D:L467394). Whether that normal is the polygon's own (a one-sided climb face) or turned
toward the actor by the segment query is the query's hit slot, not read here. The port's `contactOf` turns the normal
toward the walker (`climb.ts`, `if (side < 0)`), which makes every climb face two-sided. At MP6's brace the outcome
does not change -- from under the deck no contact is kept at all (s3, the box reject), and were one kept `topFloor`
would find only ground past the edge -- but on other maps a face
whose far side has a floor at its top would be offered from behind in the port. What settles it: a read of where the
hit slot `FUN_005b0d30` copies is filled -- the move solver's segment query (`FUN_0031e1d0` per research 217 s2.6, not
re-read here) and whether it turns the normal -- or a capture from behind a one-sided climb face.

### 4.3 The read behind 4.1 and 4.2 (PB-3b, 2026-10-16; reading, pending review)

**The stored vectors.** `FUN_005b0d30` (D:L467394-467419) copies the 32-byte hit slot to `+0x1090..+0x10ac` and two
vectors: `+0x10b0` = `param_3` and `+0x10bc` = `param_4`. In `FUN_005483d0` these are `iStack_38` and `uStack_48`
(the callers D:L413645, :413657, :413667, :413866): `iStack_38` is the actor matrix's translation (`piVar15[10]` + 0x30,
D:L413504-413507: the position as the tick began) and `uStack_48` that plus the velocity `+0xf44` (`FUN_00309240`, an
add, D:L413508-413516; `piVar15 + 0x3d1`): the position the move was headed for. The slot is the query's: word 0-2 the hit
point, word 3 (`+0xc`) the polygon, words 4-6 (`+0x10..+0x18`) the normal, word 7 (`+0x1c`) the collider (the
contact's "set" word `+0x10ac`), as `FUN_002d2890` writes it (D:L174872-174889).

**Where the hit's normal comes from.** `FUN_005483d0`'s list `DAT_0066aad0` is the hits of the actor's segment records
(`PTR_DAT_003de940[piVar15[0x3bd] ..]`, registered by `FUN_0054f410` D:L417251-417272, which queues each in the world's
batch through `FUN_0031dd90`; the record: `+4` the start, `+0x10` the end, `+0x34` the hit count, `+0x48` the hits).
The batch runs `FUN_002d4780` (D:L175736) -> `FUN_002d2890` (D:L174750) for each collider, which loads the segment into
the local frame (`FUN_003085c0`), then the polygon's plane (`FUN_002dd130`, D:L180769: its first three points into
VU0, `vcallms` 0x70) and calls the polygon's vtable `+0x14` (D:L174870-174871). For the hull's polygon (vtable
`0x406690`, set at D:L180578-180648; the ELF's word at `0x4066a4` is `0x2dd150`) that is `0x2dd150`, which Ghidra did
not decompile: a VU0 macro routine (from `0x2dd150` to `0x2dd20c`) that runs the microprogram uploaded by the MPG at
the ELF's file offset `0x2c6b4c` (virtual `0x3d754c`; its jump table at micro 0-17: `0x10` -> 288, `0x20` -> 336,
`0x70` -> 279, `0x80` -> 364). Read from those instructions:
- micro 279-285 (`0x70`): the plane's normal `(p2 - p1) x (p0 - p1)` -- the sign `polygonNormal` (Newell's) gives;
- micro 288-333 (`0x10`, the segment against the plane, `vf2` the start, `vf1` the end, as `FUN_002dd210`
  D:L180785-180798 loads them): the signed distances of both ends, a sign flag each (`fmand` 0x30, micro 315); no
  crossing (both in front, both behind) is no hit, and a crossing whose flags equal the start's `w` (micro 297
  `mtir`, micro 318-321) is no hit either. The start's `w` is `DAT_003df270`, which `FUN_002d2890` sets to 0x30 when the
  collider's `+0x80` bit 1 is set and 0x20 otherwise (D:L174831-174837): **with 0x20 only a start in front of the
  normal and an end behind it hits** -- a one-sided test; with 0x30 both ways;
- micro 336-361 (`0x20`, each edge): inside the edge or no hit; and, only for a crossing from behind (the 0x30
  case), the normal is multiplied by -1 (micro 356-358) at each edge passed;
- micro 364-377 (`0x80`): `FUN_002d2890`'s transform of the slot's point and normal to the world, the normal
  renormalised, its sign kept.
The hull's colliders are made by `FUN_00316e30` (vtable `0x4067b0`), which sets `+0x80` bit 0 and clears bit 1
(D:L215827-215828); the writers found that set bit 1 are D:L227611 (`FUN_0032ad20`'s collider) and D:L419731 (the
SEAL's own body), none the hull's (LATER 250's review adds D:L59846, `FUN_001ff8a0`: a structure worked with the camera's
direction and HUD-range positions, most likely a HUD element rather than a collider -- not the hull's either). So **the hull's hit normal is the polygon's own, and a face is hit only from its
front**: the move solver keeps no contact on a face approached from behind. (Not read: a hull collider whose `+0x80`
bit 1 is set by a path not found here.)

**Built for the throw clearance (LATER 250, 2026-10-21; reading, reviewed: its fresh review decoded micro 279-363 from the ELF):** the release request's clearance
(`FUN_005499e0` through `FUN_0031e250`, research 256 §5) runs the same per-collider `FUN_002d2890`, so on the hull it
counts a face only entered from its front. Scene `segment.ts`' `segmentHits` takes a `frontOnly` flag (`crossing`:
`n . d < 0`, a start in front of the polygon's own normal and an end behind it), which viewer `throwCommit.ts`
`throwClear` alone passes; every other caller (the mover, fire, doors, the camera, climb, traversal, the rocket,
effects, the room's queries) stays two-sided as before. The one-sided test takes the micro's own sides (micro 290-321:
the raw normal, an end behind only below -1e-5), so an end exactly on a face is no hit (the review's F1); its review
decoded micro 279-363 from the ELF's bytes and confirmed the normal's sign, the front-only mode and that the edge
test cannot turn a rejected crossing into a hit (the EE routine at 0x2dd150 returns before it). Pinned: `segment.test.ts` and `grenade.test.ts` ("LATER 250",
RED first at a wall wound so the clearance enters it from behind); Frostfire's yaw-90 container (a front entry) still
refuses. Not read: what `FUN_0032ad20`'s two-sided collider (D:L227611) makes, and whether any is in the port's grid.

**The behind test.** `FUN_005b3890` D:L468985-468989: `FUN_00309200` (a subtract) of the actor's position `+0x1c` and
the stored hit point `+0x1090`, its y zeroed, dotted with the stored normal `+0x10a0..+0x10a8` (the slot's
`+0x10..+0x18`, not `+0x10b0` or `+0x10bc`); 0 or under drops the contact. D:L468990-468993: the actor matrix's row
`+0x20` against the same normal, 0 or under drops it too.

**The contact's distance at the walk's stand-off.** The hit is the segment's crossing of the face at its line's height:
the head line's at the head + 2, the centre's at the feet + `step_height` (research 217 s2.1); nothing gates its
distance but `FUN_005b3890`'s 24 across the ground (D:L468986). With the port's stand-off the hit lies 3.5 off the body
at the line that met it, the head line's at the brace (s4.1).

**Also read, not built (the walk):** the walk's own wall query is the same one-sided test, so in the original a body
walking into the back of a hull polygon is not stopped by it; the port's slide pushes from either side. Back-to-back
pairs such as `deck_climbers` / `noclimb_invis` give each side its own face, so the brace's walk is the same either way
-- over their overlap: `noclimb_invis` (x 1670.71-1711.55) is wider than `deck_climbers` (x 1673.34-1709.32), and over
its two end strips, about 2.6 and 2.2 wide, nothing faces a body coming from +z (PAR-21a's census, below). For PAR-21.

**The census (PAR-21a C4, 2026-10-17; a heuristic over the port's hull, no body walked; no build).** A throwaway
script outside the tree (not committed) over the 22 served maps (`public/maps/index.json`, read from the disc through
`loadMap` / `groundPolygons` / `groundGrid`): of the slide's walls (`isWallSurface`; the MP2, MP6 and MP72 counts equal
research 217 s2.5's 2422, 3362 and 7390), the columns along each wall every 2 (at most 12), a spot 4 behind its plane,
each walkable floor there (`probeGround`, n_y >= 0.6428) and its lines at + 6.5, + 12.138 and + 19.394 that cross the
wall from behind. A test has **no partner** when no steep polygon faces the walker at or before 1.0 past the wall; its
spot is **reachable** when, of 16 level rays 400 long from it at the floor + 6.5, at most 8 first hits are faces seen
from behind (inside a closed solid every one is); **pass-through** when nothing faces the walker within 30 past the
wall. A wall counts once if any of its tests does; "unique" drops instanced copies with identical points (the `X` and
`X=X` pairs). Totals over the 22 maps: 112,126 walls, 43,150 tested from behind, 27,024 with no partner, **6,823 also
reachable (5,760 unique)**, 5,876 pass-through, **3,016 unique pass-through on the low line** (the feet + 6.5), 114 of
the reachable ones climb faces. Per map (walls / no partner and reachable / unique / low-line pass-through, unique):
MP1 3842 / 286 / 252 / 135, MP2 2422 / 129 / 94 / 50, MP5 4240 / 157 / 154 / 108, MP6 3362 / 248 / 184 / 69, MP7 3981 /
58 / 58 / 42, MP8 7769 / 434 / 434 / 151, MP9 8326 / 483 / 407 / 235, MP10 7242 / 530 / 311 / 111, MP11 2191 / 88 / 84 /
49, MP12 5217 / 264 / 259 / 164, MP51 4953 / 214 / 194 / 98, MP52 2864 / 498 / 490 / 396, MP53 2937 / 145 / 145 / 76,
MP61 2565 / 301 / 293 / 173, MP62 3548 / 212 / 210 / 135, MP64 9119 / 290 / 201 / 51, MP71 5132 / 285 / 176 / 64, MP72
7390 / 628 / 489 / 292, MP73 5105 / 103 / 84 / 48, MP81 2912 / 395 / 365 / 203, MP82 7831 / 521 / 475 / 158, MP83 9178 /
554 / 401 / 208. MP6's largest groups are its window quads (`mp6_window_med`, `mp6_window_wide`, each a coincident pair
facing one way), the truck bodies and `jwall06`. Not tested: the prone lines, moving owners (doors), and whether a
spot is reached from the map's play area (the rays only refuse a closed solid). So the one-sided walk would open
thousands of faces on every map: it is not built without a capture first (a body walked into the back of one of
these, MP6's window quads the first), PAR-21's call (D16's owner) on the controller's word.

*MV-PARITY (b2), 2026-10-31 (reading, pending review):* the one-sided test is now built for a face's END only (viewer
`WALL_END_CONTACT_READING`, research 217 §2.3): an end met from behind its face's own normal is no hit. Backed by the
emulator parity harness's capture of M51's ditch (EPH runs 20261031T154035Z, 154148Z, 154254Z and the live run 014055Z,
the investigation's gap (b), `agent-mail/evidence/eph-divergence-2026-10-31/`), 6d's lane decision under 5d's MV-PARITY
(b2) dispatch (the plan's Log, 2026-10-31). Faces stay two-sided, still owed the capture above; a face wound away from
the walkable side now blocks along its length but not at its end.

## 5. H160 restated

The owner's question (H160) was whether the original stops the SEAL at the scaffold or lets him climb. With the brace
render-only and its collision a climb face, the question becomes: **does the original offer the hang on
`deck_climbers`?** The reading (s2) answers **yes, from the +z side** (the icon at h 29.99, the press, "Stand -> Hang",
the pull onto the deck at 30), and **no climb from under the deck** (`noclimb_invis`, appflags 0). Walking in without
the press, the original's walk is stopped at the face by its probes as read (research 217 s2), as the port's is. A
capture of the original at the brace -- straight in from +z mid-face and near an end (the icon or not), the press, and
from under the deck -- would prove it, and settle s4.1.

## 6. Readings and placeholders

PB-3 and PB-3b added no constant. PAR-21a (2026-10-17) adds one reading and one plain value:
- `CORNER_HITS_READING` (viewer `climb.ts`, read by `cornerDrop`, which takes it as its mode; `'span'`): which of the
  walk's other hits the corner drop asks -- a face the walker stands within the horizontal span of, not one the slide's
  disc meets only at its end (s4.1, the outside corner). `'any'` asks every front-met hit. Two readings, unsettled
  (parity clause 7): a still body's side records give `'span'`'s outcome at Frostfire's -120 corner, a moving one's
  (from about 1.05 a tick) `'any'`'s; the original's stand-off there is its reach (C3), unread. `'span'` is the
  controller's choice, kept for the existing pin pending a capture: HUMAN_TASKS H229 (walk, then run, into that outside
  corner; CLIMB offered or not). The faithful rule (the side records cast for the other hits) is PAR-21's, with C3.
- `CORNER_DOT` (viewer `climb.ts`, 0.9) is the decompilation's literal (D:L413894), a reading, not a stand-in.

The values pinned by the probe are readings of the disc through the repository's readers (s1) and the port's measured
behaviour (s3); the original's offer is the reading of s2, pending review. s4.1 and s4.2 are built (PB-3b, reading,
pending review); of the departures s4.1 names, any hit replacing the contact and the corner drop are built (PAR-21a,
reading, pending review); the weapon line's slot, the moving tick's drop check and the reach are named, not built, and
the reach and s4.3's one-sided walk are PAR-21's. Was: "No constant is added (PB-3b adds none either). ... the
departures s4.1 names (any hit replacing the contact, the corner drop, the reach) and s4.3's one-sided walk are
PAR-21's."

## 7. The wall beside the brace (2026-10-21; the port, on the fixture)

The playtest names a second spot, a wall beside the brace. It is not another climb face. Measured with the page's
`Walker` and `Traversal` on the fixture `RUN/MP6.ZDB` (the bytes s1 compared with the disc; this run had no disc and
no decompilation, so nothing here is a new reading of `FUN_005b3ce0`):

- The rails `deck_dis_outside` and `deck_dis_inside` are ditype 2, appflags 0, material 3, from about 29.5 to 43.3.
  Along the brace's edge they stop at x 1672.5 and resume at x 1710.5: the gap is `deck_climbers`. From the deck at
  (1660, 30, 1428), yaw 180, the walk meets `deck_dis_inside`, stops short of its plane at z 1439, and the feet stay
  at 30. Nothing is offered. Appflags 0 is the offer's own gate (`FUN_005b3ce0` D:L469131-469132; `keepContact` asks
  `CLIMBABLE` before `planClimb`).
- The sand berm `g373` (appflags 0, along z 1380-1404) walked from (1700, 0, 1412), yaw 0: the feet stay at 0, the
  walk meets `g373`, and nothing is offered.
- The deck's stair, `di_top1` polygon 2293, walked from (1800, 0, 1616), yaw 0, still ends on the deck at 30. That
  ramp is the deck's own way up (s1), and it stays.

No walker change follows. `deck_climbers` remains the class-4 hang of s2: a press from the +z side, feet on the ground
until the press. What a capture still has to show is s5.
