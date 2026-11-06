# 383 -- r0004's per-map collision: 231 polygons and 76 edits on 20 MP maps and two missions (R4B-09, G1)

- Date: 2026-11-05. Task R4B-09 of the [r0004 plan](../plans/r0004-option-b.md), under the owner's ruling OT.R97
  (MISSION: r0004 is the specification for gameplay). Branch `agent/sb2-g1` (segment-body-2, 6d's lane).
- Track: simulation. It changes the collision of 22 levels: new invisible walls, moved vertices, rewritten surface
  words, props moved, nodes switched off, two node lists overwritten.
- Status: **reading, pending review** (R4B.R3), every value. Nothing r0004-specific here is measured running. The
  values come from the r0004 investigation's transcription v2 (`C:/Projects/agent-mail/evidence/r0004-investigation/
  scratch/pmc-v2/transcription-v2.json`, G1b, 2026-11-05): an emulation of the r0004 block r4 0x2d4c20-0x2eb710, run
  from the dispatcher's own branch per map, by `probe2.py` over the PINE dump `game/overlays_r0004/socom2_game_r0004.elf`
  (the block is byte-identical in the served decrypt, the cluster note's §2). An emulator run of the original's
  instructions is a reading of the code, not a measurement (R4B.R3). A reviewer who did not write this re-reads the r4
  sites in the PINE dump and the served decrypt before they count as readings (R4B.R4).
- Sources: the cluster note `cluster-per-map-collision-patches.md` (§1-§6), its v2 diff `pmc-v2/CHANGES-v1-v2.md`
  (112 rows, each with its r4 address) and `segment-body/sb2/G1b-REPORT.md`; REPORT.md row G1 and the corrections at
  its foot; dot's G1 row (partly corroborated: the loader hooks and the dispatch). r0001 is cited `FUN_<addr>` /
  `D:L<line>` of `game/analysis/socom2_game.elf.decomp.c`; "r4 0x..." is an r0004 address (r4 0x2d4c20 is not r0001's
  `FUN_002d4c20`). The disc facts are r0001's maps through `parseSceneGraph` (`r0004MapPatchDisc.test.ts`). No
  decompiled or disassembled text is pasted.

## 1. Where it runs, and on which level

r0004's two loader callers (`FUN_001ebba0` / `FUN_001ebda0`, D:L50650, D:L50728) reach r4 0x2d4c20 (the `jal` at r4
0x1ebc04 and 0x1ebdd8) in place of r0001's `FUN_001ea720` (D:L49713-49741). After the level loads (`FUN_001e91c0`) and
before `CMission_Open` it runs a `strstr` chain over the level's name (r4 0x2d4c68-0x2d5214): mp11, mp10, mp12, mp1*,
mp51, mp52, mp5*, mp61, mp62, mp64, mp6*, mp71, mp72, mp73, mp81, mp82, mp83, mp2*, mp8*, mp9*, m52, m61, m73* -- the
first match wins, `*` only for a name of `strlen == 3`. The name is `0x414e00` (`FUN_0027f800`), the lobby's mission
written `"mp%d"` (research 154; `FUN_0027f810` D:L197344-197345): the archive's stem in lower case.

The port: `applyR0004MapPatch(models, stem)` (`packages/scene/src/r0004MapPatch.ts`) on a map's freshly parsed scene
graph, called once by the page (`viewer/src/loadMap.ts` `place`, right after `parseSceneGraph`, before the turrets, the
draw and the hull read it) and by the room (`viewer/src/simMap.ts` `simMapFromBytes`, before `worldCollision`). One code
path; no per-map switch in the mover. It edits the graph in place, as the engine edits its loaded graph, so a moved
prop is drawn where it collides.

## 2. The table and its counts

`tools/r0004MapPatchGen.ts <transcription-v2.json>` writes `packages/scene/src/r0004MapPatchTable.ts` (committed;
re-running it on the same input reproduces it byte for byte): one list per map, every float as its single bits, in the
order the code runs them -- the transcription's rules in their emulated order, the other records placed by pc within
their routine, the dispatcher's inline code last (r4 0x2d4eec / 0x2d4f44: the routines' `jal` come first).

**Counted here** (`r0004MapPatch.test.ts`, against the table; the plan's "not independently counted"):
- **Polygons: 231 with one crate** -- 219 on new nodes, the crate cap's 1 (one per crate: 2 on r0001's MP72, so 232
  placed), 11 appended to mp61's `di_ext01`. v1's 230 lacked the cap; dot's 219 + 11 counted v1.
- **New nodes: 105 attached** (104 under a named parent, the crate cap) and 4 constructed and never attached (mp62 r4
  0x2db408, 0x2db4a8; mp72 0x2d4f7c; mp82 0x2e6db8).
- **Operations: 76 collision-side**, as G1b recounts them: 41 vertex stores (33 box snaps, m52's two relative boxes,
  6 index-store sites as 8 stores), 8 surface-word rewrites, 11 stores to byte +0x80 (5 clears, 5 copies, 1 onto
  itself), 5 prop moves (with the two barrels' identity and rotY), 5 switch-off sites, 6 `m_di` assigns (one onto
  itself). **Plus 4 render-side** (m73's region shifts), counted, not applied. The plan's "about 35 rules" is the snap
  count alone.

## 3. The operations

| kind | r4 code (G1b) | the port |
|---|---|---|
| new node + polygons | ctor r4 0x3343d0 (= r1 `FUN_00316e30`, D:L215806-215844: identity `FUN_001bff28` D:L215816, +0x80 bit 0 := 1 D:L215827, active `FUN_00317060`), `CDIPoly` ctor (= r1 `FUN_002dc4c0`, D:L180438-180462: region and refcount 0), `AddDI` (`FUN_00313d60`), has-DI (`FUN_003130b0`, D:L213593), bbox, `AddChild` | a `SceneNode` (type 1, flags active + has-DI, the identity, `R0004_NEW_NODE_PLACEHOLDER`) under the parent `FindByName` gives; the level's own name is the world root (`R0004_MAP_ROOT_READING`, §4); MP72's cap under each world-root crate at the identity (`AddChild` on the crate, r4 0x2d719c), so the Forge's hide takes it with the crate (`flattenScene` realises an instance node's own children; none on the disc as read) |
| polygons appended | mp61 `di_ext01`, after the wall-top snaps (from r4 0x2de76c) | pushed onto the node's list in order |
| vertex snap | each polygon of the node, each vertex: six strict compares on the stored point (DI +0x10), then three stores; mp61's guards name two vertices of a polygon; m52's second box is the else-if of the first (r4 0x2e6950-0x2e69c0), its stores `sub.s` 0.1 | `snap`: strict `<`/`>`, `==` for mp81's `crate_1`; a relative store chopped (`chopF32`, the EE's rounding) |
| index store | `sw` into polygon *i* vertex *k* (mp12 r4 0x2d8dac; mp51 0x2d6394; mp72 0x2d70c4-0x2d70f4) | `point`; an index past the list does nothing |
| surface-word rewrite | `lw`/`lbu`, `and`, `or`, `sw`/`sb` (the masks as the code has them, G1b §5) | `word`: the word rebuilt from the reader's fields, masked, unpacked; a mask touching bits the reader does not keep throws |
| +0x80 byte | `lbu; and 0xfe; sb` (clear), `lbu src; sb dst` (copy) | `SceneNode.stopAtFirstHit`; read by no port query (§5) |
| prop move | `add.s` / `sub.s` on +0x30..+0x38, or a store; the barrels: identity (r4 0x1bff28), `sceVu0RotMatrixY` (r4 0x1c0118 = r1 `FUN_001c0118`), the translation | `move` (chopped), `identity`, `rotY` (`R0004_ROTY_MATRIX_PLACEHOLDER`) |
| switch-off | node vtable +0x38 (r4 vtable 0x433040 -> 0x1ec450: +0x5c bit 0 := 0) | `hide`, `hideGridNamed` (MP72's basket by its local translation's box); `flattenScene` clears `m_active` down the node's subtree -- `FUN_002d3030` tests a node's `m_active` and `m_hasDI` before its polygons and its children (D:L175073-175074; the children's loop D:L175383-175389 is inside it) -- an instance's model root taking the instance's (the engine's instance node *is* the copied model, `buildScene.ts` `worldDi`); `collisionOwners` reads it (`R0004_SWITCH_OFF_REMOVES_COLLISION_PLACEHOLDER`) |
| `m_di` assign | r4 0x25a130 = r1 `FUN_00259af0` -> `FUN_00259d20`: the destination lists the source's pointers | `assignDi`: the node's list becomes the source's polygons, the same objects; its own are gone (`R0004_DROPPED_DI_COLLIDES_PLACEHOLDER`) |

`FindByName` (r4 0x32f490 = r1 `FUN_00311ef0`, D:L212946-212977) is a linear search of the registry, the first match
winning; the port takes the graph in file order (the models, then the world), depth first. A path's next names are
every child of that name; an instance's children are its model's (the engine copied the model in), so an edit through
one -- MP1's door `dipoly` -- lands on the shared model, which only the two doors place (`r0004MapPatchDisc.test.ts`).

## 4. What r0001's disc says (dev-disc, `r0004MapPatchDisc.test.ts`, 151 cases on 23 levels)

- **Every node the routines name is on the disc**, but MP82's `mp5` (r4 0x2e6e90, 0x2e71fc: two nodes, five polygons):
  no node of MP82's graph carries the name -- the cluster's weapon model (§1 item 11) -- so the port attaches them
  nowhere, as they reach no world in r0004.
- **Every snap box and index store moves real r0001 vertices, but three boxes written in world coordinates**
  (`R0004_WORLD_FRAME_BOXES_READING`): MP72 r4 0x2d818c (`b1_wc02`; the vertex sits at world (1875.23, 101.624,
  1699.99), local (600.31, 59.12, 277.31)), MP72 r4 0x2d82dc (`b1_wc04`; world (1327.615, 59.733, 1904.539) -- the same
  vertex r4 0x2d8cf4 then moves by its local box (52.695, 17.233, 481.85), so the frame question G1b left open is
  answered: the stored points are local and the world-frame box is dead), MP9 r4 0x2e4344 (`land_19/congo_tree1`: the
  box is the tree instance's world origin; the node has no polygon of its own). The port does what the code does on the
  stored points: nothing. The vertices moved, per box (the last column of §9): MP51 3/5/4/2/4/3/1/2/1, MP52 5/1/1,
  MP61 1/1/1 (polygons), MP62 7/3/2/2/2, MP64 4, MP6 2/4/2/1, MP71 2/2, MP72 0/0/1, MP81 12/12, MP9 0, M52 2.
- **m52, settled**: both boxes match, one vertex each (x 4543.469 by the first, x 4529.388 by the else-if), both lowered
  by 0.1 chopped.
- **The "before" values the cluster left unread**: MP1's door `dipoly` WOOD_THICK (19) -> WOOD_THIN (20), ten polygons
  over the two doors; MP82 `g11986` the map default (0) -> INVISIBLE_DI (3); MP8 `land43/climber1` appflags 4 -> 0, nine
  faces (the disc's climb-face census 1450 -> 1441); MP62 `di3` inside 1 -> 0; MP72 `di_roof22` ten ditype-3 floors
  -> 2. **MP82's `cam_di` rewrite is a no-op on r0001**: `FindByName` finds the first of four `cam_di`, whose six faces
  already have cameratype 1.
- **The map-root parent** (`R0004_MAP_ROOT_READING`): MP2's terrain model `mp2` sits at (960, 0, 800), and MP2's new
  node's first corner (617, 142, 961) is a corner of the barracks' floor in the world's frame -- under the model it
  would float 960 and 800 away. So a node hung under the level's own name is in the world's frame; on the other maps a
  model of that name is at the identity or absent.
- **MP72's crate caps**: two (`R0004_CRATE_CAP_COUNT_READING`), the world root's two direct `crate_bananas_stacked4`;
  the third crate is under `b2_wc03_crates`.
- **The overwrites** (G1b §7, the source nodes' own polygons edited): MP51's `di_roof_h02_2` ends listing
  `ground_wc06`'s 108 polygons (its own nine, polygon 8 just edited, gone: the hull 99 longer); MP62's first `di2` lists
  `di3`'s 16 (its own five gone).
- **Duplicate names**: MP62 has three `di2`, MP6 two `g65` and five `g67`, MP82 four `cam_di`; the first in file order
  is taken, as `FindByName` takes the first.
- **The switch-offs survive the world's opening state** (fresh review 1's F1): `collisionOwners` marks such an owner
  `switchedOff`, and `WorldState`'s `sync` (`applyInitial`, `reset`, every change) keeps it off whatever the zAnim
  references say (`r0004WorldState.test.ts`: MP72's 2 owners, MP71's 4, MP73's 12). The forge room's archive parts
  (`match/src/forgeSimMap.ts` `archiveParts`) take the same edits (F2, `r0004ForgeParts.test.ts`).
- **No node of the 23 levels is switched off above a polygon as read**, so `flattenScene`'s inherited switch changes
  nothing on the disc; r0004 switches off MP71's `b1` (and its two barrels with it), MP72's one basket at (825.74,
  46.02, 2038.16), and MP73's six `room_chair01` under `comm_low`, `mywc20` and `wall_breaker/good` -- not `comm_hi`'s
  two, and not `mywc20` or `good` themselves (G1b's correction).
- **The hull grows** per level: MP11 11, MP10 1, MP12 9, MP1 5, MP51 112, MP52 5, MP5 2, MP61 75, MP62 19, MP64 3, MP6
  15, MP71 1, MP72 18, MP73 4, MP81 2, MP82 18, MP83 8, MP2 3, MP8 11, MP9 6, M52 8, M61 0, M73 1.

## 5. Not ported here (LATER 707)

- *Ported by LATER 707 (`agent/sb2-707`, 2026-11-05; reading, pending review):* the switched-off nodes leave the draw
  too. The draw walk's gate is `FUN_003389c0` (the world's node draw, from the grid walk `FUN_00339de0` D:L236971): the
  node's `+0x5c` bit 0 first (D:L236069, with bit 23 and the region test, D:L236069-236074), and only inside it the
  node's visuals (`FUN_003374c0`, D:L236189-236192) and its children (D:L236208-236219) -- the draw's twin of the
  probe's `FUN_002d3030` D:L175073-175074 (research 318 §1.2 read the same gate for the strips). `placeInstances`
  (`buildScene.ts`) keeps only a visual-bearing node `flattenScene` leaves active, so the page, its grid and the forge
  room's parts (`archiveParts`) draw none under a node off; the chunk keys of the rest do not move. **Counted on the
  disc** (`drawGateDisc.test.ts`, 34 archives): as read no node of any graph has bit 0 clear, so the gate hides nothing
  on a map r0004 does not touch; with r0004's edits it hides exactly 9 placements -- MP71 2 (`b1`'s two
  `barrel_green_closed`), MP72 1 (the one `basket_open_up` of its several), MP73 6 (`room_chair01`'s `good`: 1 under
  `comm_low`, 4 under `mywc20`, 1 under `wall_breaker/good`). The page's `WorldState` and the draw agree: the world
  children holding an owner it keeps off are those holding a gated placement, on all three. A switched-off placement is
  never drawn again, as `WorldState` never turns its owners on (§4). The room draws nothing.
- *And the four readers (LATER 707):* `soundData.ts`, `effectData.ts`, `mapActions.ts` (its own parse, `loadMap`'s
  fallback) and the e2e helper `later568Replay1798.spec.ts` apply `applyR0004MapPatch` right after their parse. On the
  disc as read (`r0004ReadersDisc.test.ts`, 23 levels): no ambient effect's node, action node or sound emitter is moved
  by r0004, so those outputs are unchanged; the surfaces the sound banks are chosen by gain MP2's PLASTER floor (39) and
  MP11's material-0 floor (its `none` default, no sounds) -- on MP2 the page now wants PLASTER's step, stealth, crawl
  and landing, which `borrowMissing` (its own placeholder) lends from MP71's ambience bank.
- m73's region shifts (r4 0x2e8224, 0x2e8274, 0x2e82c4, 0x2e83cc; `m_region_shift` 2 -> 4, guarded by the node's own
  bits; LATER 415) and the texture paints on m61, mp61 and mp12 (r4 0x373550; purpose unknown): render-side.
- The +0x80 byte is recorded on the node and read by nothing: `FUN_002d3030` takes it as a type-2 (column) query's
  "stop at this node's first hit" (D:L175276, D:L175372) -- a type-1 (vertical) query stops at a node's first hit
  whatever the byte (D:L175318-175348), which is the port's `firstHit`; the cluster's "a type-1 query stops at the first
  polygon" is this note's correction -- and the port has no type-2 query that walks a node's polygons in order.

## 6. Walk impact, and the capture ac should take

Staged in Node, main against the branch (`packages/viewer/test/r0004WalkImpact.test.ts`, the MP72 fixture): r0004
makes `wc22/di_roof22` ditype 2 (r4 0x2d4fcc, the dispatcher's inline code). Its two sloped faces over the east end are
the only floor between the sky and the street there. A body at (1000, 95.51, 1990) stands on main; under r0004 the probe
finds only the street, and the same body set at 95.51 falls and lands at (1000, 42.50, 1990) after 41 ticks.

**The capture** (ac's two-client rig, PCSX2 `--build r0004`, offline is enough): MP72, Crossroads. One client: no
other input; place the SEAL at x 1000, z 1990 on the roof's east slope (y about 95.5; reached by any route the roof
allows, or the rig's teleport), yaw 0, and leave it still 3 s. **Read**: the SEAL's y each frame from the placing (main
and r0001: stays at 95.5; r0004 by this reading: drops to 42.5 within about 1.4 s), and the walk's floor polygon. A
second read in the same run proves `di_roof22`'s word: its 19 polygons' +8 words after r4 0x2d4c20 returns, every ditype 2.
The rest of the dump list (CAPTURE-SPEC-COMBINED part B) settles the placeholders below.

**First-by-name check** (a later turn; fresh review 2's N4, `R0004_NODE_NAME_FIRST_READING`): on MP6, which `g65`
and which `g67` r4 0x2dbd2c / 0x2dbd8c edited (the points of every `g65` and `g67` after r4 0x2d4c20 returns: only the
first of each, `worldmodel/g65` and `worldmodel/g67`, should differ from r0001); on MP82, which `cam_di` r4 0x2e6d44
reached (the +8 words of all four: only the first's path written, a no-op on its already camera-only faces -- a
breakpoint on the store's address reads which node).

## 7. Tests

- `packages/scene/test/r0004MapPatch.test.ts` (no disc): the dispatch and its strlen guard; each operation on a graph
  built by hand (a strict box, a two-vertex guard, the chopped relative store and its else branch, an index store and
  one past the list, the masks, the +0x80 clear and copy, the moves and rotY, a switch-off and its subtree in the probe,
  the grid box, the overwrite, new nodes in their frames, an edit through an instance); the table against the recount.
- `packages/scene/test/r0004MapPatchDisc.test.ts` (dev-disc): §4, per level.
- `packages/viewer/test/r0004MapPatchWiring.test.ts`: the room's MP2 hull holds the three polygons (fixture); the page's
  and the room's call sites. `walk.test.ts`'s Frostfire walk (the page's `loadMap`) now counts 3318 + 3.
- `packages/viewer/test/r0004WalkImpact.test.ts`: §6.

## 8. Placeholders and readings

| Name | Status and evidence needed |
|---|---|
| `R0004_NEW_NODE_PLACEHOLDER` | scene `r0004MapPatch.ts`: a new node's matrix (the constructor's identity, r4 0x3343d0 -> `FUN_001bff28`), its flags (active, has-DI) and its layer bits (+0x5c bits 13-17, whatever the pool held: 0 here). Placeholder. To proven: ac's dump of a new node after r4 0x2d4c20 returns (CAPTURE-SPEC-COMBINED part B). |
| `R0004_DROPPED_DI_COLLIDES_PLACEHOLDER` | scene `r0004MapPatch.ts`: false -- the polygons an `m_di` overwrite drops (MP51 `di_roof_h02_2`'s nine, MP62 `di2`'s five) are gone, the intersect walking the node's own list (D:L175290-175300). Placeholder. To proven: ac's MP51 / MP62 dumps, and a probe of the dropped roof on r0004. |
| `R0004_SWITCH_OFF_REMOVES_COLLISION_PLACEHOLDER` | scene `r0004MapPatch.ts`, `buildScene.ts` `flattenScene`'s `flags`: a switched-off node and its subtree leave the probe (D:L175073-175074, D:L175383-175389). Placeholder. To proven: ac's capture -- a body walked into MP71's barrels and onto MP73's chairs on r0004. |
| `R0004_ROTY_MATRIX_PLACEHOLDER` | scene `r0004MapPatch.ts`: MP51's two barrels' turn -- the rows c 0 -s / 0 1 0 / s 0 c (libvu0's layout, not read) and `Math.cos`/`Math.sin` to single precision (the VU0 sine `FUN_001bff50` not evaluated). Placeholder. To proven: a dump of the two barrels' matrices on r0004. |
| `R0004_CRATE_CAP_COUNT_READING` | scene `r0004MapPatch.ts`: 2, MP72's world-root `crate_bananas_stacked4` children on r0001's disc. Reading, pending review. To proven: ac's MP72 dump (the crates and their last child's DI). |
| `R0004_MAP_ROOT_READING` | scene `r0004MapPatch.ts`: a node hung under the level's own name is in the world's frame (§4: MP2's corner on the barracks' floor). Reading, pending review. To proven: a new node's parent in ac's dump. |
| `R0004_WORLD_FRAME_BOXES_READING` | scene `r0004MapPatch.ts`: MP72 r4 0x2d818c and 0x2d82dc, MP9 r4 0x2e4344 hit nothing in the stored points (§4). Reading, pending review. To proven: `b1_wc02`'s and `b1_wc04`'s points dumped after r4 0x2d4c20 returns on r0004. |
| `R0004_NODE_NAME_FIRST_READING` | scene `r0004MapPatch.ts`: a repeated name finds the first node in the graph's file order (`FindByName`'s first match, D:L212946-212977; the registry's fill order not read) -- MP62's three `di2`, MP6's two `g65` and five `g67`, MP82's four `cam_di`. The disc supports it in part: the first `di2` stands at `di3`'s translation (1744.81, 174.94, 1342.38), the pair `di2.m_di := di3.m_di` implies. Reading, pending review (fresh review 1's F4). To proven: the node each lookup returned, in ac's dump. |

## 9. Every rule (reading, pending review; the transcription v2's records, `CHANGES-v1-v2.md` for each r4 address)

The new nodes, then every other edit with what it changed on r0001's disc (vertices for a snap or an index store,
polygons for an appended list, a rewrite or an overwrite, nodes for a move, a switch or the byte).

| map | new nodes (ctor r4 pcs) | polygons | parents |
|---|---|---|---|
| MP11 | 7 (0x2d9930, 0x2d9ad0, 0x2d9d60, 0x2d9fb4, 0x2da1fc, 0x2da34c, 0x2da5e0) | 11 | `g338_1`, `mp11` |
| MP10 | 1 (0x2e5dc0) | 1 | `mp10` |
| MP12 | 3 (0x2d8dd8, 0x2d9220, 0x2d93a0) | 9 | `mp12` |
| MP1 | 5 (0x2dce0c, 0x2dcf64, 0x2dd0bc, 0x2dd254, 0x2dd3d4) | 5 | `mp1`, `land18`, `land58` |
| MP51 | 9 (0x2d5dd4, 0x2d5f4c, 0x2d6088, 0x2d61e4, 0x2d6ee0, 0x2e8600, 0x2e88f0, 0x2e8bf0, 0x2e8ef0) | 13 | `wc12A`, `wc12C`, `wc22A`, `mp51` |
| MP52 | 2 (0x2e5a30, 0x2ea910) | 5 | `g1967`, `mp52` |
| MP5 | 1 (0x2e6a70) | 2 | `mp5` |
| MP61 | 29 (0x2de080, 0x2df210, 0x2df378, 0x2df710, 0x2e0140, 0x2e0478, 0x2e05b8, 0x2e0820, 0x2e0b80, 0x2e0ed0, 0x2e1140, 0x2e15c0, 0x2e1820, 0x2e1ac0, 0x2e1d40, 0x2e1fc0, 0x2e2260, 0x2e24e0, 0x2e27b0, 0x2e2930, 0x2e2ac0, 0x2e2d20, 0x2e30e0, 0x2e3500, 0x2e3680, 0x2e3820, 0x2e39a0, 0x2e3b10, 0x2ea770) | 64 | `g1818_1`, `mp61` |
| MP62 | 4 (0x2da780, 0x2dada4, 0x2daff0, 0x2db590) | 8 | `g14_5`, `mp62` |
| MP64 | 1 (0x2dca34) | 3 | `mp64` |
| MP6 | 5 (0x2db800, 0x2dbe50, 0x2dc1d0, 0x2dc550, 0x2e9650) | 15 | `mp6` |
| MP71 | 1 (0x2e552c) | 1 | `mp71` |
| MP72 | 12 (0x2d7180, 0x2d731c, 0x2d7478, 0x2d75f4, 0x2d7764, 0x2d78d4, 0x2d7a28, 0x2d7f28, 0x2d8500, 0x2d87d0, 0x2d8a80, 0x2e91f0) | 17 | each world-root `crate_bananas_stacked4`, `mp72`, `wc12`, `wc11` |
| MP73 | 2 (0x2e4c9c, 0x2e4f90) | 4 | `mp73` |
| MP81 | 1 (0x2e9390) | 2 | `mp81` |
| MP82 | 9 (0x2e6e90, 0x2e71fc, 0x2e74a0, 0x2e7850, 0x2e7b00, 0x2e7c48, 0x2e7df0, 0x2eadf0, 0x2eb2b0) | 23 | `mp5`, `mp82` |
| MP83 | 3 (0x2d52e0, 0x2d59c0, 0x2d5b50) | 8 | `c1`, `mp83` |
| MP2 | 1 (0x2e4830) | 3 | `mp2` |
| MP8 | 3 (0x2e99c0, 0x2e9e80, 0x2ea250) | 11 | `mp8` |
| MP9 | 4 (0x2e3cc0, 0x2e3e44, 0x2e3fbc, 0x2e4580) | 6 | `mp9` |
| M52 | 1 (0x2e5f60) | 8 | `m52` |
| M73 | 1 (0x2e8460) | 1 | `m73` |

| map | r4 | edit | on r0001 (vertices, polygons or nodes changed) |
|---|---|---|---|
| MP12 | 0x2d8dac | `g406` polygon 0 v3.y set | 1 |
| MP12 | 0x2d8db0 | `g406` polygon 0 v3.z set | 1 |
| MP1 | 0x2dd64c | surface word of `door_outhouse1/alaska4d_outhouse_door/dipoly` & 0xfffc03ff, or 0x5000 | 5 |
| MP1 | 0x2dd64c | surface word of `door_outhouse2/alaska4d_outhouse_door/dipoly` & 0xfffc03ff, or 0x5000 | 5 |
| MP1 | 0x2dd704 | +0x80 of `land49` cleared | 1 |
| MP1 | 0x2dd738 | +0x80 of `land58` cleared | 1 |
| MP1 | 0x2dd770 | +0x80 of `invis25` cleared | 1 |
| MP1 | 0x2dd7a8 | +0x80 of `invis29` cleared | 1 |
| MP1 | 0x2dd7e0 | +0x80 of `land59` cleared | 1 |
| MP51 | 0x2d5d5c, 0x2d5d70, 0x2d5d7c | `wc06/sandbag_turret` translation moved (add.s / sub.s) | 3 |
| MP51 | 0x2d6394 | `di_roof_h02_2` polygon 8 v1.x set | 1 |
| MP51 | 0x2d6398 | `di_roof_h02_2` polygon 8 v1.z set | 1 |
| MP51 | 0x2d63e4 | `di_roof_h02_2`.m_di := `di_wall_wc09`'s | 9 |
| MP51 | 0x2d63f0 | +0x80 of `di_roof_h02_2` copied from `di_wall_wc09` | 1 |
| MP51 | 0x2d658c, 0x2d6590, 0x2d6594 | vertex snap on `di_wall_wc09` | 3 |
| MP51 | 0x2d65ec, 0x2d65f0, 0x2d65f4 | vertex snap on `di_wall_wc09` | 5 |
| MP51 | 0x2d664c, 0x2d6650, 0x2d6654 | vertex snap on `di_wall_wc09` | 4 |
| MP51 | 0x2d66ac, 0x2d66b0, 0x2d66b4 | vertex snap on `di_wall_wc09` | 2 |
| MP51 | 0x2d671c | `di_roof_h02_2`.m_di := `ground_wc14`'s | 38 |
| MP51 | 0x2d6728 | +0x80 of `di_roof_h02_2` copied from `ground_wc14` | 1 |
| MP51 | 0x2d685c, 0x2d6860, 0x2d6864 | vertex snap on `ground_wc14` | 4 |
| MP51 | 0x2d68bc, 0x2d68c0, 0x2d68c4 | vertex snap on `ground_wc14` | 3 |
| MP51 | 0x2d692c | `di_roof_h02_2`.m_di := `wc11`'s | 93 |
| MP51 | 0x2d6938 | +0x80 of `di_roof_h02_2` copied from `wc11` | 1 |
| MP51 | 0x2d6a64, 0x2d6a68, 0x2d6a6c | vertex snap on `wc11` | 1 |
| MP51 | 0x2d6ac4, 0x2d6ac8, 0x2d6acc | vertex snap on `wc11` | 2 |
| MP51 | 0x2d6b34 | `di_roof_h02_2`.m_di := `ground_wc06`'s | 23 |
| MP51 | 0x2d6b40 | +0x80 of `di_roof_h02_2` copied from `ground_wc06` | 1 |
| MP51 | 0x2d6c24, 0x2d6c28, 0x2d6c2c | vertex snap on `ground_wc06` | 1 |
| MP51 | 0x2d6d24 | `wc13/wood_barrel` matrix := identity | 1 |
| MP51 | 0x2d6d3c | `wc13/wood_barrel` rotY -2.0943899 | 1 |
| MP51 | 0x2d6d58, 0x2d6d60, 0x2d6d68 | `wc13/wood_barrel` translation set | 3 |
| MP51 | 0x2d6e04 | `wc24/wood_barrel` matrix := identity | 1 |
| MP51 | 0x2d6e1c | `wc24/wood_barrel` rotY 2.0943899 | 1 |
| MP51 | 0x2d6e34, 0x2d6e40, 0x2d6e44 | `wc24/wood_barrel` translation set | 3 |
| MP52 | 0x2e5784, 0x2e5788, 0x2e578c | vertex snap on `g3471` | 5 |
| MP52 | 0x2e592c, 0x2e5930, 0x2e5934 | vertex snap on `g2490_4` | 1 |
| MP52 | 0x2e598c, 0x2e5990, 0x2e5994 | vertex snap on `g2490_4` | 1 |
| MP61 | 0x2de598, 0x2de59c | vertex snap on `di_ext01` | 1 |
| MP61 | 0x2de680, 0x2de684 | vertex snap on `di_ext01` | 1 |
| MP61 | 0x2de768, 0x2de76c | vertex snap on `di_ext01` | 1 |
| MP61 | 0x2de76c+ | 11 polygons appended to `di_ext01` | 11 |
| MP62 | 0x2daaec, 0x2daaf0, 0x2daaf4 | vertex snap on `g14_5` | 7 |
| MP62 | 0x2dab4c, 0x2dab50, 0x2dab54 | vertex snap on `g14_5` | 3 |
| MP62 | 0x2dabac, 0x2dabb0, 0x2dabb4 | vertex snap on `g14_5` | 2 |
| MP62 | 0x2dac1c | noop: m_di assigned onto itself | 0 |
| MP62 | 0x2dac28 | noop: stop flag copied onto itself | 0 |
| MP62 | 0x2dad0c, 0x2dad10, 0x2dad14 | vertex snap on `g14_5` | 2 |
| MP62 | 0x2db364, 0x2db368, 0x2db36c | vertex snap on `g2_2` | 2 |
| MP62 | 0x2db408 | stray: constructed, never attached; no polygon | 0 |
| MP62 | 0x2db454 | surface word of `di2` & 0xff7fffff, or 0x0 | 5 |
| MP62 | 0x2db4a8 | stray: constructed, never attached; no polygon | 0 |
| MP62 | 0x2db4b8 | `di2`.m_di := `di3`'s | 5 |
| MP62 | 0x2db4c4 | +0x80 of `di2` copied from `di3` | 1 |
| MP62 | 0x2db50c | surface word of `di3` & 0xff7fffff, or 0x0 | 16 |
| MP64 | 0x2dc9b0, 0x2dc9b4, 0x2dc9b8 | vertex snap on `walkable_terrain_2314` | 4 |
| MP6 | 0x2dbd8c, 0x2dbd90, 0x2dbd94 | vertex snap on `g65` | 2 |
| MP6 | 0x2dbd2c, 0x2dbd30, 0x2dbd34 | vertex snap on `g67` | 4 |
| MP6 | 0x2dbd8c, 0x2dbd90, 0x2dbd94 | vertex snap on `g67` | 2 |
| MP6 | 0x2dbd8c, 0x2dbd90, 0x2dbd94 | vertex snap on `garage_wall` | 1 |
| MP71 | 0x2e544c, 0x2e5450, 0x2e5454 | vertex snap on `di_perimeter` | 2 |
| MP71 | 0x2e54ac, 0x2e54b0, 0x2e54b4 | vertex snap on `di_perimeter` | 2 |
| MP71 | 0x2d4f14 | `b1` switched off | 1 |
| MP72 | 0x2d70c4 | `b1_wc02` polygon 23 v1.y set | 1 |
| MP72 | 0x2d70cc | `b1_wc02` polygon 23 v2.y set | 1 |
| MP72 | 0x2d70e0 | `b1_wc02` polygon 24 v3.y set | 1 |
| MP72 | 0x2d70f4 | `b1_wc02` polygon 26 v2.y set | 1 |
| MP72 | 0x2d818c, 0x2d8190, 0x2d8194 | vertex snap on `b1_wc02` | 0 |
| MP72 | 0x2d82dc, 0x2d82e0, 0x2d82e4 | vertex snap on `b1_wc04` | 0 |
| MP72 | 0x2d847c | each grid `basket_open_up` in the box switched off | 1 |
| MP72 | 0x2d8cf4, 0x2d8cf8, 0x2d8cfc | vertex snap on `b1_wc04` | 1 |
| MP72 | 0x2d4fcc | surface word of `di_roof22` & 0xfffffffc, or 0x2 | 19 |
| MP72 | 0x2d4f7c | stray: constructed, never attached; no polygon | 0 |
| MP73 | 0x2e4c28 | `comm_low/room_chair01` switched off | 1 |
| MP73 | 0x2e4c28 | `mywc20/room_chair01` switched off | 4 |
| MP73 | 0x2e4ed0 | `wall_breaker/good/room_chair01` switched off | 1 |
| MP81 | 0x2e5c3c | vertex snap on `crate` | 12 |
| MP81 | 0x2e5d20 | vertex snap on `crate_1` | 12 |
| MP82 | 0x2e6d44 | surface word of `cam_di` & 0xfff3ffff, or 0x40000 | 6 |
| MP82 | 0x2e6db8 | stray: constructed, never attached; no polygon | 0 |
| MP82 | 0x2e6e04 | surface word of `g11986` & 0xfffc03ff, or 0xc00 | 4 |
| MP8 | 0x2d9884 | surface word of `land43/climber1` & 0xff8fffff, or 0x0 | 9 |
| MP9 | 0x2e4344, 0x2e4348, 0x2e434c | vertex snap on `land_19/congo_tree1` | 0 |
| MP9 | 0x2e4440 | `land_20/congo2_tree3` translation moved (add.s / sub.s) | 1 |
| MP9 | 0x2e44f0 | `land_19/congo_tree1` translation moved (add.s / sub.s) | 1 |
| M52 | 0x2e694c, 0x2e69c0 | vertex snap on `g21955` (box, else box) | 2 |
| M73 | 0x2e8224 | render: region shift (render side, LATER 415) | 0 |
| M73 | 0x2e8274 | render: region shift (render side, LATER 415) | 0 |
| M73 | 0x2e82c4 | render: region shift (render side, LATER 415) | 0 |
| M73 | 0x2e83cc | render: region shift (render side, LATER 415) | 0 |
