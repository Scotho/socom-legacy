# 318 -- A map's line strips under the mesh's on/off state (PAR-90, PARITY-2)

- Date: 2026-10-14 (PARITY-2, row PAR-90, from the forge lane's FG-32 through the main merge controller; plan
  [`../plans/2026-10-08-web-sprint-parity-2.md`](../plans/2026-10-08-web-sprint-parity-2.md), brief
  [`../plans/briefs/2026-10-14-par90-strips-state-read.md`](../plans/briefs/2026-10-14-par90-strips-state-read.md)).
  Branch `agent/par90-read`, base 66058618a. **A read alone**: no build, no test written, no node process run.
  *B0, 2026-10-14*: brief
  [`../plans/briefs/2026-10-14-par90-b0-strips-survey.md`](../plans/briefs/2026-10-14-par90-b0-strips-survey.md),
  branch `agent/par90b0`, base ad98112fe. The survey of every map, a dev-disc test
  (`packages/viewer/test/stripsSurveyDisc.test.ts` at 53139f2a5; the review's folds at a87e56e56), its numbers in
  §3.1-§3.2, the region test read in §1.4, and §0, §2, §3, §4 and §6 corrected where it differs, each with the text it
  replaces beside it.
- Status: **reading, pending review.** The read (reviewed: Fable, PASS WITH FINDINGS, folded at its merge) is source
  inspection only: the decompilation, the game ELF's bytes, the committed fixture `test-fixtures/RUN/MP72.ZDB` read by
  eye (`grep -b` for the offsets, `od` for the words at them), and the port's code; no game, emulator, capture, browser
  or reader was run for it. Every value below is a reading until a reviewer who did not write it re-reads it at the
  source. *B0's* parts, marked so, are a dev-disc run through the repository's readers (the counts the read took by
  eye, re-taken) and a decompilation read by their author, reviewed at f1102afb5 (PASS WITH FINDINGS, high; its four
  low findings folded, F1-F4).
- Sources: `D:L<n>` is `game/analysis/socom2_game.elf.decomp.c` (SHA256
  `B9E863762F08D55602C4310C9491286879CFCF2947683E723BC2905E1AAA42D4`, the bytes research 230 and 251 pin). The ELF is
  `game/disc/socom2_game.elf` (SHA256 `06B83684719A78AD0580F236BD0EDDD40453F87D9C30C0D39021331915798872`), its words
  read by a scratch script, for the visual tables only; its strings list `game/analysis/socom2_game.elf.strings.txt`.
  The fixture `RUN/MP72.ZDB` (SHA256 `f5d22b9a...c72005cd`, as `test-fixtures/MANIFEST.json` holds it): its members
  `READERM.ZAR` (offset 6144), `MP72_GEO.ZED` (4661248, 1151680 bytes), `MP72_MDL.ZED` (8747008), `MZANIM.ZAR`
  (11317248) and `CZANIM.ZAR` (11421696), located by the table of contents `@s2u/archive` `parseZdb` reads (36 §1).
  Evidence: `packages/mesh/SEMANTICS.md` §12 (the `LINE_STRIP` packet); [research 209](209-the-mutable-world.md) §6,
  §8-§10 (MAP-02); [research 199](199-h4-hostage-closures.md) and [research 230](230-gameplay-feel-parity-audit.md)
  (`m_active`, `+0x5c` bit 0); [research 204](204-r2-ui-frontend.md) (the grid walk); the forge lane's FG-32
  (`agent/forge-2` 4fbf7d950, its report in `docs/plans/2026-10-12-forge.md` on that branch, 2026-10-14T04:52Z).

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R318.1 | **A strip is drawn with its node, under the node's own bit.** A `LINE_STRIP` packet sits inside a visual's DMA chain, and a visual's draw ships its chain whole; every path to a visual's draw first tests its node's `m_active` (`+0x5c` bit 0). A node off draws neither its triangles nor its strips | the port's strips must follow their placement's state, at the opening and at every switch | §1 |
| R318.2 | **The bit is read at every frame's walk**: what sets it (the disc at load, zAnim's init and commands, the round's reset) takes effect at the next frame's draw, strips with the rest | a run-time switch must reach the strips too | §1.3 |
| R318.3 | **Crossroads' `light_off` is a lamp of its own, not a lamp's off state.** `light_bright`, `light_off` and `light_dim` are three models of the map's library; 7 `light_off` instances stand where no other lamp stands; every lamp instance is active on the disc; no zAnim archive of the map and no string of the game names them; there is no `light_on` | by this read the original draws the 7 `light_off` lamps, bulb and filament, from the start and through every round: the port's error is the hidden bulb, not the drawn filament | §2 |
| R318.4 | **Other maps (*B0*):** of 34 maps (22 multiplayer, 12 campaign) only two draw strips under a placement the page hides at the opening: Crossroads' 7 `light_off` (189 segments) and M63's 12 `light_generator01_off` (324). The name rule hides 148 placements on 18 maps; bit 0 is set on every node of every map's GEO archive, so the disc itself hides nothing. *Was:* "Frostfire draws no strip; Desert Glory's 31 strip tags are not tied to a hidden placement by anything committed; the other 19 maps are unread" | B1's scope at the opening is those two maps; B3's is the name rule alone | §3, §3.1 |
| R318.5 | **The port: four differences.** The strips never take a state (D1); a strip-only prop has no entry to switch (D2); the name rule hides Crossroads' 7 `light_off` bulbs (D3); the drawing never reads the disc's own `m_active` (D4). The room draws nothing: the row is the page's | the build list, B0-B3 | §4, §5 |
| R318.6 | **Region 0 passes the region test (*B0*).** `FUN_00290b80` passes a node of region 0 whenever the camera's region word has bit 0, and every writer of that word sets bit 0 | the region index cannot hide Crossroads' lamps, nor any of the 148 name-hidden placements (all region 0) | §1.4 |

## 1. The original's strips

### 1.1 One chain a visual, strips inside it

SEMANTICS §12: a strip is the GS packet a chain tag of relocation type 1 carries. `CVisual::SetBuffer` patches types 1
and 2 alike and the DMA walk needs no special case; what differs is the packet's GIFtag (`PRIM` 2, `LINE_STRIP`). The
chunks that would not decode before §12 held only strips: a node can carry a visual of strips alone beside its mesh
visuals. The port reads both out of the same chain (`interpretChainPartsAs` in `loadMap.ts` `decoder`).

The draw of a visual, as the decompilation has it:

- `FUN_003374c0` (D:L235375ff) is called with a node and walks its visuals (the count at `+0x88`, the list at `+0x8c`,
  D:L235396). Each visual is drawn at once through its table's slot `+0xc` (D:L235435), or handed to the alpha list
  (`FUN_003371b0`, D:L235438) by research 82's alpha-pass rule.
- The visual's table: the constructors `FUN_003b8c70` and `FUN_003b8cd0` (D:L309616, D:L309635) put `0x408330` at the
  visual's `+0x20`, `FUN_003b9760` `0x408350` (D:L309952), `FUN_003c3e90` and `FUN_003c4390` `0x408380` (D:L315918,
  D:L316100). In the ELF's bytes the word at `+0xc` of all three tables (`0x40833c`, `0x40835c`, `0x40838c`) is
  `0x3b5340`: `FUN_003b5340` (D:L307371-307380), which calls `FUN_003b4580` when the visual has a buffer (`+0x34`).
  The alpha list's draw `FUN_00336cb0` calls `FUN_003b4580` too (D:L235172).
- `FUN_003b4580` (D:L306829ff) asks `FUN_003b6e10` (D:L306873) for the chain of the current instance context -- the
  head and its length in quadwords off the visual's `+0x38` table (D:L308377-308380) -- and copies it into the frame's
  packet in blocks (`FUN_00350950`, D:L307010, D:L307100, D:L307273). Nothing in it looks at a packet's type: the
  `LINE_STRIP` packets go out with the triangles, or neither does.

### 1.2 The gate: the node's `m_active`

Every caller of `FUN_003374c0` tests the node's `+0x5c` bit 0 first, and draws nothing of it when the bit is clear:

| caller | what it is | the test | the draw |
|---|---|---|---|
| `FUN_003389c0` | the world's node draw (from the grid walk `FUN_00339de0`, D:L236971; from `FUN_002d8fe0`, D:L178673) | D:L236069, with flag bit 23 (`+0x5e` bit 7) and, when bit 31 is set, the region test `FUN_00290b80` | D:L236189-236192; the children inside the same test, D:L236208-236219 |
| `FUN_00338480` | the node draw for the nodes flagged `+0x5f` bit 0 (D:L178676, D:L236217) | D:L235893 | D:L235998; its children inside the test |
| `FUN_003381f0` | the deferred list (`+0x674`) of a node `FUN_00338480` does not draw at once | D:L235779, its children at D:L235809 | `FUN_003383f0` |
| `FUN_00336a60` | the 2D walk (research 112) | D:L235074 | D:L235081 |

The alpha list is fed only from `FUN_003374c0` (D:L235438), so it holds no visual of an inactive node either. So: a
node whose bit 0 is clear draws none of its visuals, meshes and strips alike, and under the recursion of `FUN_003389c0`
none of its subtree. (Which nodes the grid links on their own, and so whether an inactive ancestor reaches a child the
grid draws directly, is research 204's walk and not this row's.)

The bit is `tag_NODE_PARAMS`'s flag word, bit 0, `m_active` (reCOM `zNode/znode.h:78`; research 199, 230): offset 92
of the disc's record, `+0x5c` of the node, where the port's reader keeps it (`@s2u/scene` `sceneGraph.ts` `FLAGS_AT`,
`SceneNode.flags`).

### 1.3 When it changes

- **At the map's load:** the disc's flag word; then zAnim's node references, bit 31 deactivating (`FUN_0026b5e0`
  D:L115740-115750, research 209 §4, §8); then the animations that start with the set (research 209 §9,
  `AUTOSTART_INITIAL_READING`).
- **In play:** an `OBJECT_ACTIVE_STATE` command, through the node's SetActive (its table's `+0x38`, research 199), and
  the AI word's fade (research 199).
- **At the round's reset:** `FUN_0026b430` (D:L115690-115721) from `FUN_002ac0e0` (D:L151976-151991), research 209 §8.
- **Read:** at every frame's walk (§1.2). Nothing caches it for the draw: the frame after a change draws the node, or
  not, strips included.

### 1.4 The region test, for region 0 (*B0*)

Owed to B0 by the review (§2.2). **Reading, pending review**: the decompilation alone, read by B0's author.

- The gate of `FUN_003389c0` (D:L236069-236074) calls the region test only for a node whose bit 31 is set, with the
  mask `1 << region`, the region being the flag word's bits 13-17 (the word shifted left 46 and right 59 in the
  decompilation's 64-bit arithmetic); `FUN_00338480` makes the same call under its own condition
  (D:L235896-235900). Region 0 gives the mask 1.
- `FUN_00290b80` (D:L137103-137117) turns a mask of 0 into 1 and passes when the global `DAT_003de208` is clear or the
  object's word at `+0x2a8` shares a bit with the mask. The object is the one `FUN_003389c0` reads at its first
  argument's `+0x628`.
- Every write of that word sets bit 0: the constructor `FUN_00293a80` (the class whose methods surround
  `FUN_00290b80`, its view angles 70 and 49 at D:L138692-138693) stores 1 (D:L138757, with `+0x2a0` and `+0x2a4` 0), and
  the two setters `FUN_00290bd0` (D:L137128) and `FUN_00290c00` (D:L137141) store `+0x2a0 | 1 | +0x2a4`. So a region-0
  node passes whatever `DAT_003de208` holds, on every frame.
- D:L168005 is a save and restore on the same object, and keeps bit 0: `FUN_002c7bf0` saves the word's low 16 bits as
  a short (D:L167973) beside the object itself (D:L167975), and `FUN_002c7d00` writes that short back to the same
  object's `+0x2a8` (D:L168005), zero-extended. *Fixed at the review (F4); was:* "the other stores at a `+0x2a8` in the
  ELF (D:L85754, D:L168005 among them), which this read places on other objects by their context and does not trace
  further."
- Not read here, and not needed for region 0: what the other regions' bits mean, who sets `DAT_003de208`, and the other
  stores at a `+0x2a8` in the ELF (D:L85754, D:L85823, D:L166526, D:L300866, D:L301337, D:L303005, D:L344388,
  D:L412004), untraced.
- Seen at the same gate and not in §1.2's table: `FUN_003389c0` also wants the float at the node's `+0x9c` to be at
  least 0.0078125 (1/128; D:L236074). It is past the disc's 96-byte record, a run-time field; this read does not name
  it. Every lamp of §2 and every name-hidden placement of §3.1 is region 0 (§3.1's table): the region test hides
  none of them.

## 2. Crossroads, by the data

### 2.1 Three lamps, not three states

`READERM.ZAR`'s `mp72_lib.rdr` lists the map's models by file: `light_bright.flt`, `light_off.flt` and
`light_dim.flt` are three entries among the crates and tables (fixture offsets 22683-23313). The map has no
`light_on`: no such string anywhere in `MP72.ZDB`. The game names none of them: `socom2_game.elf.strings.txt` holds no
`light_off`, `light_on`, `light_bright`, `light_dim` or `nolight` (its only `_on`/`_off` pairs are the menus'
`HIGHLIGHT_ON`/`Highlight_off`).

### 2.2 The placements

In `MP72_GEO.ZED` each lamp is an instance node (type 2) whose record -- the 64-byte matrix, the 24-byte box, the type
and the flag word -- runs straight into the model's name. Read by eye at each name's offset:

| model | instances | flag word | the box (model space) |
|---|---|---|---|
| `light_bright` | 13 (offsets 5582272-5584832, 5621664, 5622784) | `0x80801071` on all | +/-60 x -83.5..36.5 |
| `light_off` | 7 (5618496, 5619264, 5620128, 5620896, 5622016, 5623136, 5624000) | `0x80801071` on all | +/-3.97 x -6.70..0.50 |
| `light_dim` | 3 (5624768, 5625120, 5625376) | `0x80801071` on all | +/-30 x -46..14 |

`0x80801071`: bit 0 (`m_active`) **set**, bit 12 (`m_hasDI`, research 230) set, bit 23 set (`m_hasVisuals`, reCOM
`znode.h:96`; was: "the second half of `FUN_003389c0`'s gate" -- the review, F2), bit 31 set with region index 0 (bits
13-17) -- the same word on every lamp, so the walk treats the three kinds alike. Region 0 passes `FUN_00290b80`'s
region test on every frame (§1.4, *B0*; was: "Whether region 0 passes `FUN_00290b80`'s region test is not read here;
being the same word on all 23 lamps, it cannot single out `light_off` (owed to B0)"). The `light_off` prototype's own
root (type 7, the record at 5202320, found by the same box) carries `0x80841051`, bit 0 set, and three `vparams` words.

*B0, through the readers* (`parseSceneGraph`, `flattenScene`; the test pins each): 13 `light_bright`, 7 `light_off` and
3 `light_dim` instance nodes, `0x80801071` on all 23; no node on any lamp's path from `worldmodel` has bit 0 clear; the
prototype's root `0x80841051`. The realised `light_off` prototype is that one node, with its three visuals, in each of
the 7 contexts: 7 realised nodes, bit 0 set on all 7. The 7 positions below are the test's pins, to 0.1.

The 7 `light_off` lamps stand at (x, y, z, translation row, no rotation): (1615.0, 132.8, 1471.1), (1576.0, 132.8,
1552.4), (1313.7, 142.8, 1104.6), (1184.7, 86.1, 1074.7), (1395.0, 142.9, 1102.4), (923.4, 138.1, 1397.7), (965.6,
138.1, 1762.1). No `light_bright` or `light_dim` shares an (x, z) with any of them -- the nearest, the `light_bright`
at (1184.7, 86.1, 1144.7), is 70 units off. A `light_off` is an 8-unit bulb hung on its own, not a twin drawn over a
lit one: the z-fight the name rule was written against (`loadMap.ts` `Placement.alternate`'s doc, `light02/nolight`,
`hornlightbox_on/_off`) is not there.

### 2.3 Nothing switches them

The map's `MZANIM.ZAR` and the common `CZANIM.ZAR` carried in `MP72.ZDB` are plain text where names are (`destroyed`,
`healthy`, `seal_demo_site1` found in them) and hold no `light_off`, `light_bright` or `light_dim`; research 209 §6 says
the same of the references alone. *Added at the review (F1):* the committed `RUN/MPZANIM.ZAR` and the ZDB's
`LDZANIM.ZAR` name none of them either, and the 7 instances' parent nodes (`worldmodel` `0x80000051`; the
`b1_wc01_lights`, `b2_wc03_lights`, `b2_wc07`, `b3_wc2_lights`, `b4_wc03_lights` groups, `0x80801051`) all have bit 0
set and are named by no zAnim archive -- a deactivated parent would hide its subtree (D:L236209-236219), so this
matters. The first wording read MZANIM and CZANIM only. With the disc's bit set and no code or script naming them, **the
7 `light_off` lamps are active from the load and through every round: the original draws their bulbs and their
filaments.** (`LAMP_OFF_DRAWN_READING`, §6.) The lamps' flag word has `m_hasDI`: the hull holds their polygons, as the
port's hull already does (§4).

### 2.4 Their strips

SEMANTICS §12 names Crossroads' light filaments (`light_bright`, `light_off`, `light_dim`) among the strips: 163 tags of
relocation type 1 in `MP72_MDL.ZED`. FG-32 counted 189 segments for `light_off` (the forge plan on `agent/forge-2`, its
line 401; a dev-disc run, not reviewed; was: "and 687 for Crossroads, all of them props'" -- the 687 is not in that
plan, the review, F3; dropped until B0 counts it); 189 over 7 lamps is 27 a lamp.

*B0 confirms both* (was: "Which of the prototype's three visuals carries the strips, and the count itself, are owed to
B0 through the readers"). **189 segments**, 27 a lamp, all in the prototype root's **third visual**, `V02` (chunk keys
`N000_I000_V02` to `N000_I006_V02`, its `vparams` word `0x9c4fa`). Crossroads draws **687** segments in all, equal to
`LoadedMap.lines`' total, every one a prop's: `light_bright` 351 (13 x 27, its `V03`), `light_off` 189, `light_dim` 81
(3 x 27, its `V03`), `tent_beige` 33, `tent_gray` 22, `tent_red` 11.

## 3. Every map

The goldens hold no placement names and no strips (`scene-graphs.json` counts nodes, visuals and polygons;
`world-roots.json` the root's records). What the fixtures and the committed notes give:

- **Frostfire (MP2):** no strip on the map (SEMANTICS §12). Its `nolight` (one name in `MP2_GEO.ZED`, offset 4022765)
  hides meshes only. *B0:* 0 segments; the name is placed 12 times, 6 under `light02` (each at the lamp's own drawn
  root in (x, z): a twin, §3.1) and 6 under `light02b`, a lamp whose realised instance draws nothing but its
  `nolight`, so the page draws none of those six lamps.
- **Desert Glory (MP6):** 31 strip tags: the power lines, the lamp brackets (`mp6_light_neck`, `mp6_light_hangout`), the
  `cuffs_left`/`cuffs_right` chains. No lamp `_off` node; its `coals1..4_on_off` are animation names in `MZANIM.ZAR`,
  not nodes. Whether a strip lies under a path zAnim opens off (`beer_parts`, `barrel_parts`, `parts_bad`, the parked
  F-18 pair, `access1/bad_parts`; research 209 §9) is not committed. FG-32 reported 71 of its 76 segments in strip-only
  models with no prop entry. *B0:* no strip lies under any of its 141 zAnim-off placements, nor under any path zAnim's
  initial state names; the name rule hides nothing on it; 12 strip-only prop placements hold 71 of the 76 segments,
  FG-32's count confirmed.
- **Crossroads (MP72):** §2. Its other strips are the tents' guy ropes (`tent_beige`, `tent_gray`); the bases' zAnim
  states are the arches and the plant-zone pulses (research 209 §4, 284), none a tent's ropes by any committed count.
  *B0:* `tent_red` too (§2.4); no segment lies under a path zAnim's initial state names, so no zAnim command reaches a
  strip on Crossroads; its 66 zAnim-off placements hold none.
- **The other maps** (*B0*, §3.1; was: "The other 19 maps: unread. B0 must count, per map: the strips of each
  placement; for each placement the page hides at the opening (zAnim's init and autostart, the name rule), its strips;
  for each placement the name rule hides, the disc's bit 0 on the node and every ancestor, whether a placement of
  another model stands at its place, and whether any zAnim archive names it").

### 3.1 B0's survey, every map (*B0*)

**Provenance.** A dev-disc run of `packages/viewer/test/stripsSurveyDisc.test.ts` at commit 53139f2a5 (branch
`agent/par90b0`), 2026-10-14, over the dev host's disc tree (`SOCOM_DISC`): all 36 of its tests ran and passed, none
skipped. Re-run at a87e56e56 after the review's folds, which add prints only (each row's mesh count and zAnim name):
the same numbers, 36 of 36 passed. The numbers below are its printed table, copied; none is asserted but §2's pins.
Reading, pending review.

**How.** The test composes `loadMap.ts`'s own readers per placement, which `LoadedMap` does not keep: the model chain
(`mdlArchives`), `place`'s placements (the world model, the turret parts, the clutter), `readMapMeta`'s initial state,
the name rule (`ALTERNATE_STATE`, `loadMap.ts:1127`, copied because it is not exported) and the strip decode
(`decoder`, `Segments.add`). Two checks hold it to `loadMap` itself on every map: its segments sum to
`LoadedMap.lines`' total, and its opening state equals `LoadedMap.props[].alternate` on every path of a meshed prop
(a mutation of the copied rule, `_off$` dropped, fails six maps' checks). The second check sees the meshed props only
(*fixed at the review, F1*; was: "on every prop path"): the world's placements (`placement.world`, `loadMap.ts:1135`,
merged by texture) and the strip-only props (dropped, `loadMap.ts:451`) leave `loadMap` without a path, so their
opening state is the composition's own and unchecked. B1's entries for the strip-only props (D2) would close that gap.
Every name-hidden placement of the table below is a meshed prop (the run prints each one's mesh count; M63's
`light_generator01_off` has 2 meshes a placement), except MP73's `plankaccess1` remains, a world placement. It reads
the 22 multiplayer maps and the 12 campaign missions (`CAMPAIGN_STEMS`). A zAnim name is looked for in every
`*ZANIM.ZAR` the map's ZDB carries and in the disc's `RUN/MPZANIM.ZAR`; `parseAnimSets` refuses each campaign
mission's `MZANIM.ZAR` (`mission/otc_posechar`: node reference 2's parent 249 of 27), so on the campaign zAnim's
initial state and names are unread (§3.2).

**A twin** is a name-hidden placement with a placement the page draws, in the same realised instance (the path up to
its innermost `=` segment), whose world bbox centre lies within **0.5 units (5 cm) in (x, z)**. The tolerance is the
data's gap: the on/off pairs sit at 0.000-0.177 units (`screen_on`/`screen_off`, `alarm_light_on`/`_off` and
`alarm_spinner`, `hornlightbox_off` and its horn, `nolight` and its lamp); the next same-instance distances are
0.784-0.810 (MP61's gate remains, which zAnim hides anyway) and then 1.0 and up (debris against intact parts). The same
instance, because the nearest placement of any kind put a sub light on a room's chunk (0.038). *Fixed at the review
(F3); was:* "because the nearest placement of any kind put two radios' debris on a table and a desk (1.50-1.97) and a
sub light on a room's chunk (0.04)" -- the radios' 1.50-1.97 are outside 0.5 whatever the instance. The rule's blind
spot is §3.2's `g3304/sublight_off` row.

**The classes** of a name-hidden placement: *zAnim* -- zAnim's initial state hides it as well; *twin*; *alone* -- bit 0
set on its whole path, no twin, no zAnim reference naming its rule's node or one below it (Crossroads' `light_off` is
the type); *unread* -- not zAnim's or a twin, on a campaign map. The run prints, for every one of the 148 whatever its
class, whether a zAnim reference names its rule's node or one below it: none is named (0 of 148). On the multiplayer
maps every zAnim archive was read; on the campaign all but each mission's `MZANIM.ZAR`, so there the 0 is short of that
archive. *Fixed at the review (F2); was:* "No name-hidden placement on a multiplayer map is named by any zAnim reference
(the class *named* is empty)", which the class, decided before the name was read, did not show.

**Per map and per kind the name rule hides** (bits: bit 23 / bit 31, and the region; every row's bit 0 is set on the
node and on every node of its path):

| map | kind (the rule's segment) | placements | segments | bits 23/31, region | zAnim | twin | alone | unread |
|---|---|---|---|---|---|---|---|---|
| MP1 | `hornlightbox_off` | 1 (prop) | 0 | 0/1, r0 | 0 | 1 | 0 | 0 |
| MP2 | `nolight` | 12 (prop) | 0 | 0/1, r0 | 0 | 6 | 6 | 0 |
| MP11 | `vis_whats_left` | 2 (prop) | 0 | 0/1, r0 | 2 | 0 | 0 | 0 |
| MP61 | `radio_parts` | 1 (prop) | 0 | 1/1, r0 | 0 | 0 | 1 | 0 |
| MP61 | `vis_whats_left` | 4 (prop) | 0 | 0/1, r0 | 4 | 0 | 0 | 0 |
| MP62 | `radio_parts` | 1 (prop) | 0 | 1/1, r0 | 0 | 0 | 1 | 0 |
| MP71 | `vis_whats_left` | 5 (prop) | 0 | 0/1, r0 | 5 | 0 | 0 | 0 |
| MP72 | `light_off` | 7 (prop) | **189** | 1/1, r0 | 0 | 0 | 7 | 0 |
| MP73 | `radio_parts` | 1 (prop) | 0 | 1/1, r0 | 0 | 0 | 1 | 0 |
| MP73 | `vis_whats_left` | 1 (world) | 0 | 1/1, r0 | 1 | 0 | 0 | 0 |
| MP82 | `radio_parts` | 1 (prop) | 0 | 0/1, r0 | 0 | 0 | 1 | 0 |
| MP83 | `vis_whats_left` | 2 (prop) | 0 | 0/1, r0 | 2 | 0 | 0 | 0 |
| M62 | `radio_parts` | 10 (prop) | 0 | 0/1, r0 | 0 | 0 | 0 | 10 |
| M63 | `light_generator01_off` | 12 (prop) | **324** | 1/1, r0 | 0 | 0 | 0 | 12 |
| M63 | `light_pole_off` | 2 (prop) | 0 | 1/1, r0 | 0 | 0 | 0 | 2 |
| M63 | `screen_off` | 18 (prop) | 0 | 0/1, r0 | 0 | 18 | 0 | 0 |
| M63 | `sublight_off` | 4 (prop) | 0 | 1/1, r0 | 0 | 0 | 0 | 4 |
| M71 | `parts` | 9 (turret) | 0 | 0/1, r0 | 0 | 0 | 0 | 9 |
| M72 | `parts` | 18 (prop, turret) | 0 | 0/1, r0 | 0 | 1 | 0 | 17 |
| M73 | `radio_parts` | 3 (prop) | 0 | 0/1, r0 | 0 | 0 | 0 | 3 |
| M81 | `alarm_light_off` | 4 (prop) | 0 | 0/1, r0 | 0 | 4 | 0 | 0 |
| M81 | `fluoresent_light_off` | 6 (prop) | 0 | 1/1, r0 | 0 | 0 | 0 | 6 |
| M82 | `alarm_light_off` | 11 (prop) | 0 | 0/1, r0 | 0 | 11 | 0 | 0 |
| M82 | `radio_parts` | 5 (prop) | 0 | 0/1, r0 | 0 | 0 | 0 | 5 |
| M83 | `light_room01_off` | 1 (prop) | 0 | 1/1, r0 | 0 | 0 | 0 | 1 |
| M83 | `nolight` | 6 (prop) | 0 | 0/1, r0 | 0 | 6 | 0 | 0 |
| M83 | `whats_left` | 1 (prop) | 0 | 1/1, r0 | 0 | 1 | 0 | 0 |
| **all** | 27 kinds, 18 maps | **148** | **513** | | **14** | **48** | **17** | **69** |

The strips under them are two lamps' filaments, 27 segments a lamp: Crossroads' `light_off` in its prototype root's
`V02`, M63's `light_generator01_off` in its root's `V01` (chunks `N000_I000_V01` to `N000_I011_V01`), both `vparams`
`0x9c4fa`. No strip lies under a zAnim-off placement on any map.

**Per map** (GEO nodes: every node of the map's GEO archive; segments: the survey's sum, `LoadedMap.lines`' total in
brackets; bit 23 clear: on placements the page draws, the clutter left out, then on the name-hidden; strip-only: prop
placements whose chunks decode to strips and no mesh, which `loadMap` drops with their strips drawn, D2):

| map | GEO nodes (bit 0 clear) | placements | segments | name-hidden (segments) | zAnim-off (segments) | segments under a zAnim-named path | strip-only (segments) | bit 23 clear: drawn / name-hidden |
|---|---|---|---|---|---|---|---|---|
| MP1 | 585 (0) | 721 | 0 (0) | 1 (0) | 64 (0) | 0 | 0 (0) | 108 / 1 |
| MP2 | 459 (0) | 448 | 0 (0) | 12 (0) | 0 (0) | 0 | 0 (0) | 101 / 12 |
| MP5 | 296 (0) | 908 | 0 (0) | 0 | 0 | 0 | 0 (0) | 13 / 0 |
| MP6 | 1036 (0) | 802 | 76 (76) | 0 | 141 (0) | 0 | 12 (71) | 180 / 0 |
| MP7 | 574 (0) | 621 | 19 (19) | 0 | 62 (0) | 19 | 0 (0) | 71 / 0 |
| MP8 | 361 (0) | 279 | 0 (0) | 0 | 0 | 0 | 0 (0) | 54 / 0 |
| MP9 | 597 (0) | 636 | 0 (0) | 0 | 102 (0) | 0 | 0 (0) | 266 / 0 |
| MP10 | 327 (0) | 685 | 0 (0) | 0 | 0 | 0 | 0 (0) | 25 / 0 |
| MP11 | 271 (0) | 613 | 418 (418) | 2 (0) | 16 (0) | 0 | 13 (364) | 87 / 2 |
| MP12 | 490 (0) | 1180 | 0 (0) | 0 | 34 (0) | 0 | 0 (0) | 12 / 0 |
| MP51 | 528 (0) | 411 | 173 (173) | 0 | 36 (0) | 0 | 0 (0) | 160 / 0 |
| MP52 | 620 (0) | 673 | 0 (0) | 0 | 0 | 0 | 0 (0) | 23 / 0 |
| MP53 | 379 (0) | 305 | 0 (0) | 0 | 0 | 0 | 0 (0) | 12 / 0 |
| MP61 | 478 (0) | 397 | 607 (607) | 5 (0) | 59 (0) | 55 | 0 (0) | 88 / 4 |
| MP62 | 464 (0) | 1712 | 30 (30) | 1 (0) | 35 (0) | 0 | 0 (0) | 49 / 0 |
| MP64 | 533 (0) | 939 | 0 (0) | 0 | 0 | 0 | 0 (0) | 70 / 0 |
| MP71 | 525 (0) | 428 | 343 (343) | 5 (0) | 48 (0) | 0 | 0 (0) | 38 / 5 |
| MP72 | 629 (0) | 376 | 687 (687) | 7 (189) | 66 (0) | 0 | 0 (0) | 24 / 0 |
| MP73 | 929 (0) | 1722 | 146 (146) | 2 (0) | 68 (0) | 0 | 0 (0) | 107 / 0 |
| MP81 | 515 (0) | 262 | 0 (0) | 0 | 3 (0) | 0 | 0 (0) | 18 / 0 |
| MP82 | 523 (0) | 844 | 504 (504) | 1 (0) | 17 (0) | 0 | 0 (0) | 33 / 1 |
| MP83 | 947 (0) | 809 | 728 (728) | 2 (0) | 50 (0) | 0 | 26 (728) | 243 / 2 |
| M51 | 652 (0) | 2401 | 0 (0) | 0 | unread | unread | 0 (0) | 15 / 0 |
| M52 | 805 (0) | 2819 | 27 (27) | 0 | unread | unread | 0 (0) | 18 / 0 |
| M53 | 868 (0) | 5043 | 0 (0) | 0 | unread | unread | 0 (0) | 160 / 0 |
| M61 | 746 (0) | 2054 | 839 (839) | 0 | unread | unread | 1 (46) | 206 / 0 |
| M62 | 785 (0) | 4315 | 314 (314) | 10 (0) | unread | unread | 0 (0) | 140 / 10 |
| M63 | 1119 (0) | 915 | 1275 (1275) | 36 (324) | unread | unread | 13 (364) | 176 / 18 |
| M71 | 747 (0) | 481 | 196 (196) | 9 (0) | unread | unread | 0 (0) | 34 / 9 |
| M72 | 556 (0) | 602 | 0 (0) | 18 (0) | unread | unread | 0 (0) | 39 / 18 |
| M73 | 671 (0) | 543 | 718 (718) | 3 (0) | unread | unread | 1 (4) | 36 / 3 |
| M81 | 942 (0) | 861 | 436 (436) | 10 (0) | unread | unread | 0 (0) | 109 / 4 |
| M82 | 956 (0) | 2823 | 345 (345) | 16 (0) | unread | unread | 0 (0) | 88 / 16 |
| M83 | 900 (0) | 1098 | 3 (3) | 8 (0) | unread | unread | 0 (0) | 231 / 6 |

What it says:

- **The disc hides nothing.** Bit 0 is set on every node of every map's GEO archive, 21,813 nodes in all; no placement
  has a clear bit on its path. The original's opening is zAnim's (bit 31 references and the autostarts) and its code's;
  reading the disc's bit (D4) changes no opening.
- **The strips' state matters at the opening on two maps only**: Crossroads (189) and M63 (324). At run time a zAnim
  command reaches strips on two: MP7 (19 segments) and MP61 (55); Crossroads none (no zAnim path lies over
  FG-32's 11 on `tent_beige`; the forge's switch reaches them).
- **Strip-only props** (D2): MP6 12 placements (71 segments), MP11 13 (364), MP83 26 (728), M61 1 (46), M63 13 (364),
  M73 1 (4).
- **Bit 23 on the disc is not the draw state.** The gate of §1.2 wants bit 23 (D:L236069), and the disc's word has it
  clear on placements the page draws on every map (266 of MP9's, 243 of MP83's), so the disc's value cannot be the
  original's either: the load recomputes it. `FUN_002ac410` calls `FUN_0031de70` (D:L152196), which walks a list at
  `+0x684` calling `FUN_00312f20(node, 1)` (D:L219942-219946), and `FUN_00312f20` sets bit 23 on a node whose visual
  count (`+0x88`) is non-zero or a child's is (D:L213571-213583). Which nodes that list holds is not read here.

### 3.2 What the survey cannot classify (*B0*)

*PAR-92's re-run (2026-10-14; research 319 §4.2):* the reader takes the twelve campaign `MZANIM.ZAR`s now, so
`stripsSurveyDisc.test.ts` was run again at 76f831e29 (PAR-92's B1-B4) over the dev host's disc tree: 36 of 36 passed,
none skipped, the composition matching `loadMap` on every map. Over every map the classes read zanim 15, twin 13,
alone 42, named 21, unread 0 (*was:* B0's counts with 69 unread). The campaign's rows, re-run:

- **The 69 *unread*.** 23 are no longer hidden by the name rule: zAnim's initial state names their paths now, so
  zAnim decides them (M62 `radio_parts` 10, M82 `radio_parts` 5, M72 `parts` 8 of 17). 21 are *named* -- a zAnim
  reference names them, but no reference with an init bit is placed over them, so the rule still hides them (M71
  `parts` 9 and M72 `parts` 9, the T-72's `parts/part1..9`, whose `tank1startpoint` references are not placed under
  `tank1`; M73 `radio_parts` 3). 25 are *alone* (M63 `light_generator01_off` 12 with its 324 segments,
  `light_pole_off` 2 and `sublight_off` 4; M81 `fluoresent_light_off` 6; M83 `light_room01_off` 1): no zAnim
  reference names them, no twin, bit 0 set.
- **The 41 campaign *twins*.** 34 are no longer hidden by the rule (M63 `screen_off` 18, M72 `ZSU_AAgun/parts/part8`
  1, M81 `alarm_light_off` 4, M82 `alarm_light_off` 11: zAnim names their paths). M83's 6 `light_room01/nolight` stay
  twins, now with every archive read and none naming them; M83's `access_engine/whats_left` is *zanim* (its
  `vis_whats_left` is hidden at the opening by zAnim).
- **M63's `g3304/sublight_off`** is *alone*: no zAnim reference names it. The possible twin in the world chunk
  (`gwc2/in_gshk`, 0.038 away) stays open, by its second settle (the `sublight_on` nodes placed and compared).

The rows below are B0's, kept as they were read.

| placements | class | why not settled | what would settle it |
|---|---|---|---|
| the 69 *unread* on the campaign (*re-run by PAR-92 above: 23 zAnim's, 21 named, 25 alone*): M62 `radio_parts` 10, M63 `light_generator01_off` 12 (324 segments), `light_pole_off` 2, `sublight_off` 4, M71 `parts` 9, M72 `parts` 17, M73 `radio_parts` 3, M81 `fluoresent_light_off` 6, M82 `radio_parts` 5, M83 `light_room01_off` 1 | unread | `parseAnimSets` refuses each mission's `MZANIM.ZAR` (`mission/otc_posechar`, node reference 2's parent 249 of 27), so neither zAnim's initial state nor its names are known on any campaign map; `loadMap` applies no zAnim state there either | the reader taking the campaign's archives, then this survey re-run |
| the 48 *twins* (*PAR-92 above: 34 of the campaign's 41 now zAnim's, M83's `whats_left` zanim, 13 twins left*): MP1 `hornlightbox_off` 1, MP2 `light02/nolight` 6, M63 `screen_off` 18, M72 `ZSU_AAgun/parts/part8` 1, M81 `alarm_light_off` 4, M82 `alarm_light_off` 11, M83 `light_room01/nolight` 6, M83 `access_engine/whats_left` 1 (41 of them on the campaign, unread as well) | twin | bit 0 set, no zAnim reference names them (printed for each: none of the 48; every archive read on MP1 and MP2, all but `MZANIM.ZAR` on the campaign; *was:* "no zAnim reference names them (on MP1 and MP2)", F2), no game string names them (`socom2_game.elf.strings.txt`: none of `nolight`, `screen_off`, `alarm_light`, `hornlightbox`; the game names `healthy`, looked up as a node by `FUN_003adab0` D:L303201, and a record field `PARTS`, `FUN_003aad20` D:L301493). By R318.1 the original draws both copies; the disc's bit 23 is clear on 47 of the 48 (all but M83's `whats_left`, `0x80840051`), but the load recomputes that bit (§3.1) | a capture of one pair (Frostfire's warehouse lamps, M63's monitors), or the read of which nodes `FUN_0031de70`'s list reaches |
| MP61, MP62, MP73 and MP82's `radio_parts` (4, no strips) | alone | debris under an objective radio, drawn from the opening by the data alone: bit 0 set, no twin within 0.5 (MP73's sits 2.2 from its `radio_on`), named by no zAnim archive and no game string | the radio objective's code path in the decompilation, or a capture of a radio before it is struck |
| M63's `g3304/sublight_off` (1, no strips) | unread (*PAR-92: alone*); a possible twin the rule cannot see | the same-instance rule cannot see a twin in a sibling instance or in the world model. Of the off-lamps that are prototypes of their own (`light_off`, `light_generator01_off`, `light_pole_off`, `sublight_off`, `fluoresent_light_off`, `light_room01_off`), every one has its nearest drawn placement of any kind more than 0.5 away (2.88 and up), but this one: the world chunk `gwc2/in_gshk` is 0.038 away. The string `sublight_on` occurs in `M63.ZDB` (17 times, `sublight_off` 8: a byte search, not a reader), so an on-lamp may be drawn in the world's own chunks there (*added at the review, F3*) | the campaign's `MZANIM.ZAR` read (§3.2's first row); the `sublight_on` nodes placed through the readers, and the world chunk's visuals at that place compared |
| MP2's `light02b/nolight` (6, no strips) | alone | the whole `light02b` lamp: its instance draws nothing else, so the page draws none of the six lamps; by R318.3's reading the original draws them | the same evidence as `LAMP_OFF_DRAWN_READING`: one look at Frostfire |

Crossroads' 7 `light_off` are *alone* and settled by PTW.R8 (§2); the 14 *zAnim* rows (`vis_whats_left` under a
`whats_left` zAnim names) are hidden at the opening by zAnim already, and `setNodeActive` on the `whats_left` reaches
them (`world.ts:1238`).

## 4. The port, against the read

The room draws nothing: its `WorldState` holds zAnim's paths only and its hull keeps every `m_hasDI` node, the lamps'
included, as the original does (§2.3). **This row is the page's** (`packages/viewer/src/loadMap.ts`, `world.ts`).

| # | the port (this branch, 66058618a) | the original (§1-§2) |
|---|---|---|
| D1 | **The strips take no state.** `loadMap.ts:429` (the world's chunks) and `:442` (each prop placement) add every strip to `Segments` (`:1357`), merged by texture and fog with no path, no `alternate`, no `switchPath`; `world.ts:1016-1031` builds one `LineSegments` a group and queues it with `alternate` false (`:1031`) and no `switchable` entry, so `setNodeActive` (`:1238`) never reaches it (research 209 §9: "Line strips are not switched") | a node's strips are drawn exactly when its meshes are, at the opening and at every switch (R318.1, R318.2) |
| D2 | **A strip-only prop has nothing to switch.** A prop group with no mesh is dropped after its strips are added (`loadMap.ts:451`): no `props` entry, no placement key, out of `setPlacementActive` and FG-32's spans alike | the node and its bit, like any other |
| D3 | **Crossroads' 7 `light_off` bulbs are hidden.** The name rule `ALTERNATE_STATE` (`loadMap.ts:1127`, `_off$`) hides every placement under a `light_off` segment no reference names (`hiddenByRule`, `:1153`; `alternate`, `:1159`), and the group opens hidden (`#A`, `:1176`); their strips, by D1, stay drawn. The MAP-01 review's ruling kept the name rule for the lamps (`../plans/2026-10-04-three-maps-and-feel.md`, its MAP-01 Log line: "keep the name rule for the lamps (`nolight`, `light_off`)") on the premise that a lamp's off copy is a twin | bulb and filament drawn from the start, never switched (R318.3). FG-32 read the drawn filament as the error; by this read the hidden bulb is |
| D4 | **The drawing never reads the disc's bit 0.** `placeInstances` (`@s2u/scene` `buildScene.ts`) places every node with visuals whatever its flags; the opening is zAnim's plus the name rule (`loadMap.ts` `place`). *B0:* the disc's bit 0 is set on every node of all 34 maps (§3.1), so this difference changes no opening; it matters only once something clears the bit at run time, which zAnim's paths already carry (MAP-02) | the disc's bit is the first word on a node's drawing (§1.3) |

FG-32's per-placement spans (`LoadedLineGroup.spans`, `setPlacementActive` collapsing them) are on `agent/forge-2`
(4fbf7d950, merged there in 103012af0), not on `main` nor this branch, and serve the forge's hide only: B1 takes them
over or lands after them (the hot files `world.ts`, `loadMap.ts`).

## 5. The build list

| row | what to change | the test, RED first | at run time |
|---|---|---|---|
| B0 | **The survey, every map** (§3's list), through the readers in a dev-disc test, its counts written back into this note; and on Crossroads: the 7 `light_off` instances' bit 0 on the node and every node of the realised prototype, the visual that holds the strips, the segment count | a survey: no RED; its numbers are the build's inputs | -- |
| B1 | **The strips carry their placement's state.** `Segments` keeps each placement's points as a span with its path, its opening state (`Placement.alternate`) and its `switchPath`, for the world's chunks, the props and the strip-only groups (D2); `world.ts` draws a span hidden or shown with its placement and gives each a `switchable` entry, so `setNodeActive`, `setPlacementActive` and the debug `setAlternate` reach it | dev-disc, Crossroads: for every placement that draws strips, its strips are drawn exactly when its meshes are, at the opening (RED today on the 7 `light_off`: their segments drawn, their bulbs hidden); `setNodeActive(<a tent's path>, false)` leaves none of its segments drawn (RED today: FG-32's 11 on `tent_beige`) | **yes**: the original reads the bit at every frame (R318.2), so a zAnim command, the round's reset and MAP-03's `WorldState.apply` reach the strips the frame they reach the meshes |
| B2 | **Crossroads' `light_off` lamps drawn**, bulbs and filaments, once B0 confirms §2 and the controller rules on D3 (a choice between the MAP-01 review's lamp ruling and this reading: logged for the owner) | dev-disc, Crossroads: the 7 `light_off` placements' meshes drawn at the opening (RED today) | nothing switches them |
| B3 | **Fix at the root, every map:** the opening state read from the disc's bit 0 with zAnim's init and autostart, the name rule kept only where B0 shows a twin no bit, reference or command decides (D4) | dev-disc, every map with data: no placement the disc, zAnim and the twins leave active is hidden by name | the bit, as B1 |

B1 stands whatever B2 decides: if the lamps stay hidden, B1 hides their 189 segments (FG-32's ask); if B2 lands, the
strips stay drawn as they are today and the bulbs join them.

*B0's numbers for B1-B3* (§3.1, §3.2):

- **B1**: at the opening the strips under a hidden placement are Crossroads' 189 and M63's 324, nothing else on any
  map; at run time zAnim reaches strips on MP7 (19) and MP61 (55) only. The strip-only props B1 must give an entry
  (D2) are MP6's 12, MP11's 13, MP83's 26, M61's 1, M63's 13 and M73's 1. Its Crossroads RED stands as written; no
  zAnim path lies over a tent's ropes (only the debug and forge switches reach them).
- **B2**: nothing in B0 stands against it: bit 0 on the 7, their paths and the realised prototype; region 0 passes
  (§1.4); 189 segments in `V02`.
- **B3**: the disc's bit 0 hides nothing on any map, so "the opening state read from the disc's bit 0" adds nothing to
  zAnim's; B3 is the name rule's 148 placements. The 14 under zAnim are hidden by zAnim already; the 17 *alone* are
  drawn by this reading (Crossroads' 7 by PTW.R8, Frostfire's six `light02b` lamps by the same evidence, the four
  radios' debris pending their objective's code, §3.2); the 48 twins wait for a capture or the bit-23 load read; the 69
  campaign placements wait for the campaign's `MZANIM.ZAR` to read.

## 6. Readings and placeholders (candidates for the build)

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `LINE_STRIP_NODE_GATE_READING` | a placement's strips are drawn exactly when its meshes are, under its node's `m_active`, read every frame | the visual's draw shipping its chain whole (`FUN_003b4580`, D:L307010-307273) behind the node gate (D:L236069, D:L235893, D:L235779); the table slot read off the ELF's bytes (`0x40833c`) | a GS dump of the original over a strip-bearing node switched off (none is switched in play: a debugger write to its `+0x5c`) | *note only*: a candidate, B1 |
| `LAMP_OFF_DRAWN_READING` | Crossroads' 7 `light_off` lamps drawn from the load and never switched | §2: three lamp models, bit 0 set on every instance and on the prototype's root, no twin, no zAnim or game string naming them | one look at the original at (1184.7, 86.1, 1074.7) (was also: "B0's reader run over every node of the realised prototype" -- run by B0: bit 0 set on all 7, §2.2) | *note only*: a candidate, B2 |
| `NAME_RULE_HIDE_PLACEHOLDER` | the port's `ALTERNATE_STATE` hides a name-matched placement no reference names | what hides each such placement in the original: the disc's bit, a twin, a common-set name. *B0:* never the disc's bit 0 (set everywhere); per class, §3.1-§3.2: 14 zAnim's, 17 alone, 48 twins, 69 unread (was: "no source given yet for any map but Crossroads' lamps") | for the twins a capture or the bit-23 load read; for the campaign the reader taking its `MZANIM.ZAR`; for the radios' debris their objective's code (§3.2; was: "B0's survey, per map and per match", done) | *note only*: a candidate, B3 |
