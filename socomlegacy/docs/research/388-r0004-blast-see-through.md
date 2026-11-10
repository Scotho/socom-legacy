# 388 -- the blast's exposure test: r0001's own see-through hits (LATER 615) and r0004's METAL_GRATE and INVISIBLE_DI (R4B-10, G6)

- Date: 2026-11-09. Task R4B-10 of the [r0004 plan](../plans/r0004-option-b.md), under the owner's ruling OT.R97
  (MISSION: r0004 is the specification for gameplay). Branch `agent/r4b-10`.
- Track: simulation. It changes which faces shelter a body from a blast: the line from a blast to a SEAL's or a
  hostage's head now passes a face whose material the original's exposure test sees through.
- Status: **reading** (R4B.R3; re-read by its fresh reviews, `agent-mail/evidence/r4b-w2/VERDICTS.md`, and the r0004 wave 2 lane batch review, `agent-mail/evidence/mega/REVIEW-R4B-AND-THREAT-BATCH.md`, PASS WITH FINDINGS (high), 2026-11-09), every value. Nothing here is measured running; the in-game effect is
  inference until a capture. The r0004 sites below were re-read by this note's author with capstone 5.0.7 (a scratchpad
  reader over the ELF program headers) in `game/overlays_r0004/socom2_game_r0004.elf` (the PINE dump) **and** the
  served decrypt `game/r0004/served/socom2_game_served.elf`: no byte differs over r4 0x5a6a80-0x5a6c20, 0x2f91c0-0x2f91f8
  and 0x2fb9d0-0x2fba3c, and the strings at r4 0x65f1a0 / 0x65f1b0 read `METAL_GRATE` / `INVISIBLE_DI` in both (none
  of the ranges falls on the PINE dump's contaminated words, 0x1e70cc and 0x2cc670/674). A reviewer who did not write
  this re-reads them before they count as readings (R4B.R4).
- Sources: `C:/Projects/agent-mail/evidence/r0004-investigation/cluster-explosives-and-blast-occlusion.md` §0, §2, §6
  and REPORT.md row G6 with the corrections at its foot; LATER 615. r0001 is cited `FUN_<addr>` / `D:L<line>` of
  `game/analysis/socom2_game.elf.decomp.c` (the line numbers are this export's: the cluster note's D:L459137-459146 are
  D:L459173-459191 here). The disc facts are r0001's maps through the repository's readers (`simMapFromBytes`, the
  r0004 G1 table applied: research 383). No decompiled or disassembled text is pasted.

## 1. r0001's exposure test (LATER 615)

`FUN_005a0e70` is the body's handler of a queued blast (research 85 §12, 91 §5, 235 §1). It walks the queued ray's hit
list: each pass takes the nearest hit beyond the last one (D:L459127-459171, a hit on the body's own owner chain
skipped), and classifies it (D:L459173-459191):

- no hit left: the line is clear;
- the hit is **cover** -- the walk stops and the blast is vetoed unless the round is `IgnoreExplosionDI`
  (D:L459192, PF-35) -- only when all of these hold: its material entry is not null (`DAT_0044f358[FUN_002dc1d0(hit)]`,
  an index past the count reading entry 0, D:L459177-459182); the entry's `+0x3c` has bit 3, bit 1 and bit 4 clear (the
  64-bit shifts by 0x3c, 0x3e and 0x3b, D:L459183-459185); its id is not PERSON's (`DAT_003e14f8`, set by
  `FUN_002de9e0` on the string 0x3fd328 "PERSON" in `FUN_003d03d0`, D:L323423);
- otherwise the hit is **seen through** and the walk goes on to the next hit.

What the bits are:
- bit 1 is LIQUID and bit 4 PICKUP: the SOILS parser `FUN_002dde40` sets bit 0 for `VOLUMETRIC` (string 0x3f3798),
  bit 1 for `LIQUID` (0x3f37c8), bit 2 for `UNDERWATER` (0x3f37d0), bit 4 for `PICKUP` (0x3f37e0) (D:L181403-181422), and
  no other bit. On the disc WATER alone is LIQUID and ITEM alone PICKUP (`materials.rdr`, the port's `SOILS`).
- **bit 3** (the investigation's "writer unread"): `FUN_002de4b0` builds the two entries before SOILS -- `UNKNOWN`
  (string 0x3f3800) with bits 0, 1 and 4 cleared (D:L181524-181526), then `PARTICLE_SYSTEM` (0x3f3810) with bit 0 and
  **bit 3** set (D:L181549-181550). The constructor `FUN_002deb30` clears it (D:L181791). The only other writer in the
  export is `FUN_002ddc30`, the map's `DefaultMaterial`, which copies the default's flags (bit 3 among them,
  D:L181216-181218) onto entry 0. So bit 3 is PARTICLE_SYSTEM's, and entry 0's only on a map whose default is
  PARTICLE_SYSTEM (none on the disc: §4).
- **the null entry**: the table is a vector of the entries `FUN_002de4b0` and `FUN_002dde40` construct and push
  (`FUN_001fe340` on `0x44f350`); a null is not pushed, so within the count no entry is null and past it entry 0 is
  read. The test has no case in the port's table: **moot**.
- **the index**: `FUN_002dc1d0` (D:L180305-180319) returns 0 for a hit with no polygon (`+0xc` null), else the
  polygon's surface word bits 10-17, and for 0 the map's default index `DAT_0044f310`. The port's
  `surfaceMaterial(byte, defaultMaterial)` reads the same (`@s2u/scene` `projectile.ts`).

VOLUMETRIC alone (LEAFY_TREE, the `*_VOL` grasses) and a high PENETRATION (GLASS 0.99, METAL_GRATE_THIN 0.985,
CHAINLINK_FENCE 0.98) are **not** tested: those faces shelter (the aim pick's rule, `aimPickBlocks`, is another
function's).

## 2. r0004's change (G6)

r0004's twin is r4 0x5a6920 (`FUN_005a6920` in the investigation's naming). The classification is r4 0x5a6af8-0x5a6be0:

- r4 0x5a6b00-0x5a6b34: the index (`FUN_002dc1d0`'s twin r4 0x2f91c0, its default word r4 0x4526d0 = r0001
  `DAT_0044f310`), clamped by the count r4 0x452714 (= `DAT_0044f354`), the entry from r4 0x452718 (= `DAT_0044f358`);
- **new**, r4 0x5a6b38-0x5a6b54: `FUN_002de9e0`'s twin r4 0x2fb9d0 (the name map r4 0x4526f0 = r0001 `0x44f330`)
  called on r4 0x65f1a0 "METAL_GRATE" (kept in `s0`) and r4 0x65f1b0 "INVISIBLE_DI" (kept in `s2`);
- r4 0x5a6b50: the null entry -> seen through; r4 0x5a6b58-0x5a6b94: bits 3, 1, 4 -> seen through; r4 0x5a6b98-0x5a6bac:
  PERSON's id (r4 0x40c738 = r0001 `DAT_003e14f8`) -> seen through -- r0001's tests, relocated;
- **new**, r4 0x5a6bb0-0x5a6bbc: the hit's id equal to METAL_GRATE's -> seen through; r4 0x5a6bc0-0x5a6bcc: equal to
  INVISIBLE_DI's -> seen through;
- r4 0x5a6bd0-0x5a6be0: otherwise cover (`sp+0xc0`, `sp+0xd0`); r4 0x5a6c04-0x5a6c18: the cover's veto unless
  `IgnoreExplosionDI` (r4 0x3ea490 = `FUN_003c8310`).

The ids are the material table's indices: the RAM table's [3] is INVISIBLE_DI and [28] METAL_GRATE (research 199 §6,
H4-6, read from RAM), and the port's table (`materialTable()`: the two built-ins, then SOILS in file order) has them at
3 and 28 -- the bytes the hull's surface words carry. The match is certain.

Not changed in r0004 (the investigation's changed-function table): the explosion's own walk to destructibles
(`FUN_003c80e0`), the ray queue `FUN_005ac070`, `FUN_003c8310`, the fragments `FUN_005a18b0`, `FUN_005a5250`. So a
grate or invisible wall still counts on a blast's line to a scene destructible or a resting charge.

## 3. In the port -- ported

- `blastSeesThrough(m)` (viewer `net/blast.ts`): LIQUID, PICKUP, PARTICLE_SYSTEM (bit 3, by its name: §1), PERSON,
  METAL_GRATE, INVISIBLE_DI -- exactly six of the table's 46 entries (`blastExposure388.test.ts` pins the set).
- `blastExposed(grid, from, to, defaultMaterial)`: `blastSeen`'s line (the round's query class, `roundAdmits`; one side,
  research 386 §3.2) with a see-through face passed, byte 0 read as the map's `DefaultMaterial`. "Skip and go on" is the
  same as `segmentHits` keeping only cover: the line is clear when no cover is met.
- The room's players (`blastPlayers`) and hostages (`blastHostages`) take `blastExposed` with `this.map.defaultMaterial`
  -- the grenade's, the launched round's, C4's (when not `IgnoreExplosionDI`), the claymore's and the demolition bomb's
  blast alike (`bombBlast` calls the same two; research 332): the room already judged all of them by the one line to
  the head, the body's handler's (research 85 §12, 237 for the hostages), and only that line's verdict changes.
- The resting charges' line (`blastCharges`, PF-36) keeps `blastSeen`: its consumer is `FUN_003c80e0`'s walk, unchanged
  (§2). `sceneHealth.ts` `blastLine` is untouched.
- The page computes no exposure of its own (`grenade.ts` `explode`'s `damageToPlayer` is the log's, with no line, and
  the `&nomatch` flash has none either): the room's verdict is the one the page shows, so room and page agree. The bots,
  the replays and the Forge's room take the same room code.

Held by `packages/viewer/test/blastExposure388.test.ts` (the predicate over the whole table, each byte's face, the walk
past a see-through face, byte 0, the query class and side kept, the charges' line unchanged) and
`packages/match/test/roomBlastSeeThrough.test.ts` (an M67 at a SEAL behind a wall of each case, in the room).

Desert Glory's jail bars: the room's grid holds both bar sets on the same faces (`BARS_SWAP_PLACEHOLDER`, viewer
`net/hostageOrder.ts`) -- METAL_GRATE and INVISIBLE_DI -- so r0001's answer (the grate shelters, door open or shut) and
r0004's (neither does, door open or shut) need no swap: the port now gives r0004's whatever the door. The hostage
order's pick (`aimPickBlocks`) is another function and unchanged.

MP72's two browser specs that cross this line (the review's P2), read on the disc by
`packages/match/test/blastSeeThroughMp72.devdisc.test.ts` with the specs' own points and the room's 0.1 lift (a dev-disc
read, not a browser run: the specs themselves were not run here): `oneFacedWallBlast.spec.ts`'s one face met from behind
stays clear, and its two-faced control stays stopped -- by `worldmodel/b1_wc05`'s face of the map's default ASPHALT, not
an INVISIBLE_DI face; `crossroadsBaseRound.spec.ts`'s planted bomb (the base's site 10 u east, the plant hand within
7 u, the floor at 14.3, lifts 0.1-5) over a 21 x 21 u square, 2247 points, gives the same outcome under `blastExposed`
as under `blastSeen` at every one, its only cover `warehouse=warehouse/di_intwalls_wh` (ASPHALT). Neither spec's
assertions nor its recorded outcome change; the crossroads spec's prose still names the line `blastSeen`, which the
room's players now take as `blastExposed` (the same verdict there). The specs are owed a run at the batch's
`gate.sh --e2e`.

## 4. The census: polygons the change touches, per MP map

Every MP map of the disc (`SOCOM_DISC/RUN/MP*.ZDB`, 22 maps), read as the room reads it (`simMapFromBytes`: the
scene graph, r0004's G1 edits applied by `applyR0004MapPatch`, `worldCollision`, the root's `DefaultMaterial`), each
polygon's material resolved by `surfaceMaterial` (byte 0 the default). A count is of the faces the blast's line can meet
(`roundAdmits`: the side bit set, not camera-only); "x of y" where some of the material's faces are not admitted; "(r0001
n)" the same map without the G1 edits where they differ. Every placed node is counted (the room's world state may switch
some off at a time, e.g. a destructible's `healthy` / `whats_left` parts). Pinned by
`packages/central/test/blastSeeThroughCensus.devdisc.test.ts` (dev-disc; it skips without the disc), both columns: with
G1 through `simMapFromBytes`, r0001 through the archive's graph before `applyR0004MapPatch` (`worldCollision`), and the
two totals rows. The DLC maps (MP54,
MP63, MP74) are not on the disc and are not counted. ITEM (PICKUP) and PARTICLE_SYSTEM (bit 3) carry no face on any map,
and no map's `DefaultMaterial` is a see-through one, so no byte-0 face changes (MP64's root names `stone` in lower case,
which the port's table lookup does not find: UNKNOWN, a shelter either way).

| map | DefaultMaterial | polygons (r0001 -> with G1) | METAL_GRATE | INVISIBLE_DI | WATER (LIQUID) | PERSON |
|---|---|---|---|---|---|---|
| MP1 | SNOW | 8086 -> 8091 | 0 | 771 (r0001 766) | 0 | 0 |
| MP2 | METAL_THICK | 3318 -> 3321 | 78 | 242 | 0 | 0 |
| MP5 | GRASS | 7119 -> 7121 | 0 | 66 | 2 | 0 |
| MP6 | SAND | 5872 -> 5887 | 22 | 186 (r0001 171) | 0 | 0 |
| MP7 | SAND | 8387 -> 8387 | 0 | 89 of 121 | 61 | 0 |
| MP8 | DIRT | 11842 -> 11853 | 0 | 228 (r0001 221) | 0 | 0 |
| MP9 | GRASS | 14652 -> 14658 | 0 | 339 (r0001 333) | 12 | 0 |
| MP10 | GRASS | 10714 -> 10715 | 0 | 362 | 1 | 0 |
| MP11 | none | 3587 -> 3598 | 60 | 59 (r0001 57) | 0 | 0 |
| MP12 | STONE | 7961 -> 7970 | 0 | 59 (r0001 55) | 127 | 0 |
| MP51 | STONE | 8838 -> 8950 | 0 | 89 (r0001 79) | 7 | 0 |
| MP52 | WOOD_THICK | 4586 -> 4591 | 26 | 398 (r0001 393) | 30 | 0 |
| MP53 | STONE | 7611 -> 7611 | 8 | 127 | 74 | 0 |
| MP61 | STONE | 4779 -> 4854 | 66 | 165 (r0001 152) | 11 | 78 |
| MP62 | GRASS | 6380 -> 6399 | 0 | 337 (r0001 340) | 544 | 0 |
| MP64 | stone | 13093 -> 13096 | 0 | 258 (r0001 255) | 663 | 0 |
| MP71 | STONE | 8919 -> 8920 | 0 | 255 of 271 (r0001 254 of 270) | 7 | 0 |
| MP72 | ASPHALT | 9820 -> 9838 | 4 | 843 (r0001 829) | 0 | 0 |
| MP73 | SAND | 14158 -> 14162 | 4 | 366 (r0001 362) | 1 | 0 |
| MP81 | METAL_THICK | 4202 -> 4204 | 8 | 422 | 4 | 0 |
| MP82 | SNOW | 18464 -> 18482 | 4 | 238 (r0001 224) | 0 | 0 |
| MP83 | SNOW | 15605 -> 15613 | 28 | 427 | 0 | 0 |
| all 22 | | | 308 (r0001 308) | 6326 (r0001 6226) | 1544 (r0001 1544) | 78 (r0001 78) |

What the faces are (the owners carrying the most, from the same read): INVISIBLE_DI is the hull's invisible collision --
map-edge and ramp walls (MP2's `bigtank/di_invis`, `rmp*`), rails (`raildi`), tents (MP72's `tent_beige`, `tent_gray`),
railcars (MP52), furniture and shelves (MP6), the open-state bars (`okhostagerescue`), parts of destructibles
(MP72's `terrorist_base/.../healthy/basedi`, MP61's `terr_mpbase/whats_left`) and some of the G1 edits' new walls (the
"+n" above: research 383's words with material 3). Its PENETRATION is 1, so a round already passes it
(`HandleIntersections` 0x3c9b70 skips PENETRATION 1, `ignoredBy`); after this change a blast's line to a body does too.
METAL_GRATE is the grates and gratings (MP2's `bigtank/di_grate`, `grating12`, `newbridge`), MP6's shut-state bars
(`nohostagerescue`, `building_wc2/di_jail1`) and cell door, MP52's `fixed*` frames, MP72's two awnings and, on MP61, the
C4 access barrier's `access1/good_parts/di_good` (3 faces): a grenade's blast now reaches a body behind that barrier,
while the barrier's own reach line (`blastLine`, `FUN_003c80e0`) is unchanged. WATER is the water surfaces (MP62 and MP64
the most). PERSON's 78 faces are all under MP61's `g1895` (a node not identified here); r0001 already saw through them.


## 5. Readings: what is not ported

| name | listed at | kind | status |
|---|---|---|---|
| `BLAST_EXPOSURE_TIE_READING` (*note only*) | R388 §5 | gap | *note only*: each pass of `FUN_005a0e70` takes the nearest hit **strictly** beyond the last (D:L459149-459150), so a hit at exactly the distance of the one just seen through is never classified -- a cover face coincident with a see-through face, behind it in the hit list, does not shelter. The port keeps every admitted cover face (it has no hit-list order to follow), so on such a pair it shelters where the original may not. The disc's maps place one bar set per state, so the pair arises only from the port's own both-sets grid (`BARS_SWAP_PLACEHOLDER`), where under r0004 both faces are see-through and the question vanishes. Owed: the batch's hit-list order (`FUN_0031dd40`'s fill) read, or a capture of coincident faces; nothing names it in code. |
| `BLAST_EXPOSURE_NO_POLY_HIT_READING` (*note only*) | R388 §5 | gap | *note only*: a hit with no polygon (`+0xc` null) reads index 0 (`FUN_002dc1d0`), the default's copy, and so shelters unless the default is see-through; such hits come from bodies and objects, which the port's grid does not hold (the bodies' volumes are not on the blast's line). Owed: which objects the queued ray's class meets (`FUN_005ac070`'s query) -- not needed until the port puts any in the grid. |

The material-less test (the null entry) is moot (§1).
