# 422 -- Clutter in the collision walk: every grid cell's clutter list, for the body, the round and the blast (LATER 997)

- Date: 2026-11-13. The CLUTTER lane (`docs/plans/clutter.md`), seat redotcom-3b, branch `agent/clutter`, base
  `agent/v0421` 0a8ad58aef; the main controller's order (redotcom-67), from a player's report through the owner ("you
  run through trees on blizzard", 2026-11-13) and the investigation seat 8a's finding.
- Track: simulation. Status: **reading** (sections 2-4: re-read at the source by a fresh reviewer, 2026-11-13, PASS WITH FINDINGS, its
  eight findings folded the same day) -- the r0001 decompilation (`socom2_game.elf.decomp.c`, cited
  `FUN_<addr>` and `D:L<line>`), the r0004 served ELF's words compared with r0001's (cited `r4 0x<addr>` in research
  404's form: "`FUN_<r1>`'s twin (N words, M identical, K relocated)"), and the disc's data through the port's readers
  (a dev-disc probe, run twice on the boxes). **Nothing here is measured on the original running**; the Shadow PC's
  rig is asked (8a's Q8 with three legs added, section 7) and this note says what would overturn it.
- Evidence kinds, kept apart: **(D)** source inspection of the r0001 decompilation; **(W)** r0004's machine words
  against r0001's (a scan of the served ELF, scripts kept with the lane's evidence); **(P)** the probe over the port's
  readers (`agent-mail/evidence/tree-probe/tp1` and `tp2`, both exit 0, at `agent/v0421` df3af7bd64); **(O)** the
  original running -- none yet.
- New names: none. No `*_READING` or `*_PLACEHOLDER` is added or changed.
- Corrects: research 196 section 2.4 ("do not add clutter collision without separate source evidence" -- this note is
  that evidence) and research 367 section 4 ("clutter has no `di`" -- five maps' clutter does; section 5).

## 0. The answer

1. **The original's collision walk reaches clutter on every query** (D). The batched query `FUN_002d3cf0` and the two
   immediate ones (`FUN_002d4780`, the segment; `FUN_002d49c0`, the vertical line) each walk, for every grid cell a
   record touches, the cell's clutter list first -- each instance's model through the instance's matrix -- and then
   the cell's own object (D:L175686-175710; D:L175765-175788; D:L175826-175848). No query path reaches the polygon
   test or the bounds reject except through those three (section 2.4).
2. **No mask, flag or actor rule excludes clutter for the body, a round or a blast** (D). Every queued record ends
   with the mask `0xffffffff` (section 2.2); the actor skip reads a bit no clutter model carries (section 2.3).
3. **A clutter instance is in the walk exactly when its model owns collision polygons** (D; section 3): the loader
   files it on the cell's collision list only then, recomputed from the polygons, not from the file's flag.
4. **r0004 walks clutter the same, and drops one barrel** (W; section 4): every function of the walk, the queue and
   the five callers has an r0004 twin of equal length whose words are identical or relocated, bar one actor-field
   offset (+4) that every r0004 function reading that field shares; the loader's twin adds code that, on Sujo alone,
   frees one `barrel_open` instance near (614, 30, 1134) before it is filed -- the port follows r0004.
5. **The port draws clutter and builds no collision from it** (P; section 5): on five of the 22 maps, 404 placed
   instances in 42 models (403 in r0004) hold polygons that would stop a body, a round or a blast's lines, and the port's hull holds
   none of them. On Blizzard: 145 fir instances in 10 models.
6. **One-sided or two-sided for clutter: inferred one-sided, as the world is now read** (D; section 2.5, amended; research 85 s5.1 reads the world's query as mode 0x20; was: "unread for clutter as for the world"): the polygon test is VU0
   microcode with no body in the decompilation; clutter and world polygons go through the same call with the same
   set-up, so the port applies its existing per-query facing to clutter unchanged.

## 1. How it came up

A player's report through the owner, 2026-11-13: running through trees on Blizzard. The port places `CLUTTER.ZAR`'s
models for drawing (scene `src/clutter.ts` `placeClutter`; viewer `src/loadMap.ts` `clutter`) but builds collision
from the worldmodel graph alone (scene `src/buildScene.ts` `placeCollision`; `src/grid.ts` `collisionOwners`; the room's
`src/simMap.ts` `simMapFromBytes` never reads `CLUTTER.ZAR`). Research 400 (lines 330-336, 350-352) already named the
walk and Blizzard's trees and left the build to "its own task"; this note is that task's reading.

## 2. The walk (D)

### 2.1 The queue, the flush and the batched query

- `FUN_0031dd90` (D:L219870-219900) queues a segment record into the collision world's pending list (`+0x150`, at most
  0x100, the count at `+0x550`): type 2, point A and point B, and the mask from its fifth argument (`FUN_002dc660`,
  D:L219895).
- `FUN_0031de30` (D:L219905-219911) flushes the list through one call of `FUN_002d3cf0` and zeroes the count.
- In `FUN_002d3cf0`, for each object on a touched cell's list, `FUN_002d54f0` (D:L176206-176218) returns that object
  when its type byte `+0x58` is 10 -- a `zdb::CCell`, built by `FUN_002d7d70` (D:L177940-177982) -- and the code walks
  the cell's collision vector (capacity `+0xe8`, count `+0xec`, data `+0xf0`). For each instance it sets the walked top
  model to the instance's `+100` (its model), pushes the instance's matrix unless it is the identity (`FUN_002d93a0`,
  `FUN_003084f0`, `FUN_00307fa0`), and runs the per-object walk `FUN_002d3030` with the whole batch (D:L175686-175708);
  then it walks the cell object itself (D:L175709-175710). The cell object owns no polygons (its `+0x78` is zero from
  the constructor `FUN_00316e30`, D:L215825), so that last call tests nothing (inferred: nothing adds polygons to a
  cell).
- The immediate segment query `FUN_002d4780` has the same clutter loop with the immediate walker `FUN_002d2890`
  (D:L175765-175788); so has the vertical line `FUN_002d49c0` (D:L175826-175848).

### 2.2 The mask

- `FUN_002d3030` tests, per record and before any test of a node, the record's mask (`+0x44`) against `1 << L`, where L
  is bits 13-17 of the node's `+0x5c` word (`FUN_002dc620`, D:L180466-180474; the test at D:L175079-175097, the layer at
  D:L175095). A record that fails is marked done for the node's whole subtree. The immediate walker `FUN_002d2890` has
  no mask test.
- `FUN_002dc660` (D:L180477-180487) writes the mask: `0xffffffff` for an argument of zero, else the argument with bit 0
  set.
- **All five callers of the queue pass -1 as its mask** (section 2.6), and the queue writes it last (D:L219895), over
  any mask the caller set before (`FUN_0054f410` at D:L417265, `FUN_003ca5a0` at D:L320431). The blast's sphere queue
  `FUN_0031dc90` takes -1 too (D:L320404, D:L320416). So the mask excludes nothing for the body's walk, a round's line or
  a blast's lines. It matters only for the direct batches that set their own (`FUN_0029bf70`, its value at
  D:L143528-143540 unread; `FUN_005b0800`'s, unread), and there a clutter node meets the same test as a world node.
- Every clutter model the probe found has layer 0 (section 5), which passes any mask (bit 0 is always set).

### 2.3 The node gates and the actor skip

- `FUN_002d3030` tests a node only when it is active (`+0x5c` bit 0) and "holds collision" (`+0x5d` bit 4)
  (D:L175073-175074); a node that fails is skipped with its subtree (the child recursion D:L175383-175389 is inside the
  gate). `FUN_002d2890` the same (D:L174789-174792).
- The actor skip reads `+0xa1` bit 2 of the **walked top model** (the clutter instance's model, or the cell object), not
  of the node; the record's override bit depends on its type -- type 1 byte `+2` bit 1 (D:L175114-175115), type 4 bit 2
  (D:L175167-175168), type 2 bit 0 (D:L175247). Movement clears its bit 0 (`FUN_0054f410`, D:L417269).
- `+0xa1` bit 2 is cleared by the node constructor (`FUN_00316e30`, D:L215842; D:L215847 zeroes the byte). It is
  set by 18 lines in 17 functions (the decompilation grepped for `0xa1) = ... 0xa1) & 0xfb`).
  - Eight lines in seven functions write an object just instanced or copied, not a library master:
    - a model instanced from a resource of kind 2 (`FUN_00317d90`, D:L216431-216434);
    - `FUN_0025ccb0` (D:L107260);
    - `FUN_0026ee70` (D:L117998; its target, `*(+0x3c)`, not traced);
    - `FUN_002a8140` (D:L149933, D:L149960);
    - `FUN_00312aa0` (D:L213427, copied from its source);
    - `FUN_00317af0` (D:L216329);
    - `FUN_00317c20` (D:L216383).
  - `FUN_0031f240` (D:L220694) sets the bit on a node attached to the world when the node's `+0x5e` bit 5 (bit 21 of
    its `+0x5c` word) is set (D:L220691-220697).
  - Nine more mark a run-time instance, not a library master. Each registers it with the world through `FUN_0031d5e0`
    or `FUN_0031d590`:
    - Eight build it in the same function: six through `FUN_00317d90`, `FUN_005bc730` by allocating it
      (D:L473988), and `FUN_005c5340` from a pool slot (D:L479349).
    - `FUN_0059f730` re-adds an existing node taken from a character's inventory slot (D:L458419-458421).
    - Seven of the nine call `FUN_00314760(obj, 1, 1)`, and five call the world's add (its vtable `+0x18`).
    
    The nine are:
    - `FUN_0059a7f0` (D:L456089);
    - `FUN_0059dab0` (D:L457510);
    - `FUN_0059e9e0` (D:L457996);
    - `FUN_0059ec60` (D:L458035);
    - `FUN_0059f730` (D:L458436);
    - `FUN_0059fac0` (D:L458519);
    - `FUN_0059fd50` (D:L458611);
    - `FUN_005bc730` (D:L474026);
    - `FUN_005c5340` (D:L479392).
    
  The clutter loader `FUN_002d5060` (D:L176044-176163) calls no world add and no `FUN_00314760`, and neither reads
  nor writes `+0xa1` or `+0x5e`. Clutter uses the library's master model directly (section 3), so **the actor skip
  never applies to clutter**. That is inferred: the masters' construction path was not traced to its end, and no writer
  reached from the clutter loader sets the bit. (Corrected 2026-11-13: the first text said "eight writes" and missed
  the last ten functions. A fresh reader re-read the 18 lines, the clearing line and the loader's span at the source
  the same day, with no other write form of the bit found.)
- Per polygon, as for the world (D:L175293-175315, D:L175325, D:L175350): a type-2 record tests a polygon only when its
  word `+8` has bit 1 set (type 1, bit 0); bit 18 skips. The port's walk reads the same bits (`SURFACE_SIDE`,
  `SURFACE_SKIP`).

### 2.4 No query skips clutter

The polygon test (CDIPoly's vtable `+0x14`) is called only from `FUN_002d2890` (D:L174871) and `FUN_002d3030`
(D:L175328, D:L175353); the bounds reject `FUN_003124f0` only from those two; `FUN_002d3030` only from `FUN_002d3cf0`
(and itself); `FUN_002d2890` only from `FUN_002d4780` and `FUN_002d49c0` (and itself); and each of those three walks the
cell's clutter list. The direct batches (`FUN_0031de90`, D:L219994-219999: `FUN_0029bf70` D:L143549, `FUN_005ab590`
D:L464516, `FUN_005b0800` D:L467160) go through `FUN_002d3cf0`. Not surveyed: a collision path that does not use the
grid at all (a direct model-against-model test).

### 2.5 Facing and the hit

- The walkers carry no facing test of their own. The polygon test is vtable target 0x2dd150 (research 281), loaded with
  `vcallms 0x70` (`FUN_002dd130`, D:L180767-180779) and set up by `FUN_002dd210` (D:L180783-180797); it has no body in
  the decompilation (VU0 microcode), so **whether a clutter polygon is met from one side or both is unread**, as for the
  world's. Clutter and world polygons go through the same call and set-up (clutter nodes keep the constructor's
  `+0x80`, bit 1 clear, D:L215827-215828; inferred). LATER 1057's builder citations (research 382 s8: the level
  reader's nodes, all built through `FUN_00316e30`) do not cover clutter nodes or r0004's nodes, so clutter's `+0x80`
  stays inferred; r0004's "not traced" here is superseded by research 383 §3 (r0004's added nodes are built by r4
  0x3343d0, which is `FUN_00316e30`, bit 1 cleared; its `+0x80` census writes none of them on MP72 or MP83; research 85
  §5.1, 2026-11-25). Supporting, not settling: the clutter loader `FUN_002d5060` looks its model
  up by name (D:L176113) through `FUN_0031fd10` -> `FUN_00320f10` (D:L221087; D:L221750-221773) in the list at
  0x45c3c0, the same lookup `FUN_00310da0` makes for a type-2 node's prototype (D:L212344).
- A hit stores the polygon (`+0xc`) and its node (`+0x1c`), carried back to the world frame by `vcallms 0x80`
  (D:L175330-175370), the same code for clutter as for the world; a type-2 record keeps the first hit per node in
  polygon order (`+0x80` bit 0 read at D:L175276, used at D:L175372), and the consumer picks the nearest (`FUN_002d4cc0`, D:L175907-175960). The
  material is the polygon's word `+8` bits 10-17 (`FUN_002dc1d0`, D:L180302-180316): **a hit on a clutter polygon
  carries that polygon's own material**, as a world polygon's does (that the round's penetration reads it through this
  accessor is inferred, not traced).

### 2.6 The five callers of the queue

| caller | its call | the query | byte `+2` bit 0 |
|---|---|---|---|
| `FUN_0054f410` | D:L417266 | a body's movement step | cleared (D:L417269) |
| `FUN_003ca5a0` | D:L320432 | a projectile's segment, last point to next (a round's line; research 398 s1) | the constructor's 1 |
| `FUN_003c7ee0` | D:L319056 | a blast's line from its origin to each node its sphere collected (research 84 s13) | set (D:L319059-319060) |
| `FUN_005ac070` | D:L464853 | a line from an object to a bone point of a body (likely an exposure line; inferred) | the constructor's 1 (inferred) |
| `FUN_0060bc40` | D:L516715 | the generic line requests | cleared (`FUN_0060bf10(rec, 0)` at D:L516714, its body D:L516752) |

`FUN_003ca5a0` also queues the blast's sphere (type 4) through `FUN_0031dc90` (D:L320404, D:L320416). All are flushed by
`FUN_0031de30` into `FUN_002d3cf0`.

## 3. The loader (D)

- `FUN_002d5060` (D:L176046-176160; called at map load, D:L217270) opens `clutter.zar`, requires version 4
  (D:L176098-176099) and walks its `Clutter` list. Each model is found by name in the library (`FUN_0031fd10` ->
  `FUN_00320f10` -> `FUN_00312120`, D:L221082, D:L221750, D:L213012): **the library's master, shared by every
  instance, not a copy**. Each instance (`FUN_002d9560`, D:L178766-178786: `+100` = the model at D:L178787) reads `params` (0x60
  bytes: the matrix) and `scale_inverse` (`FUN_002d94b0`, D:L178745-178762), then is inserted by `FUN_002d55c0`.
- **Insertion** (`FUN_002d55c0`, D:L176252-176370): the instance goes into every cell overlapped by its model's bounds
  scaled by 1/`scale_inverse` and moved by the instance's translation -- **not turned by its rotation**. An instance
  whose origin is off the grid is dropped (D:L176288-176291).
- **Which list** (`FUN_002d7b00`, D:L177843-177860): when the model root's `+0x5d` bit 4 is clear it is recomputed by
  `FUN_003130b0`; set, the instance goes on the cell's collision vector (`+0xe8`, the one the walk reads); clear, on
  `+0xcc`, which the walk never reads.
- `FUN_003130b0` (D:L213593-213635) sets `+0x5d` bit 4 on a node when it owns polygons (`+0x78` non-zero) or any child
  has the bit; the level's finalisation re-runs it over the clutter on each cell's collision vector (`+0xe8`) and the cell
  objects, not over the `+0xcc` list (`FUN_0031de80`, D:L219978-219985 in D:L219955-219990, from `FUN_002ac410` at
  D:L152195). `FUN_002d7b00` recomputes before it chooses whenever the bit is clear, and a model whose file bit is set
  but which owns no polygons lands on `+0xe8`, has the bit cleared at finalisation and is gated out at D:L175073-175074.
  So at run time **a clutter model holds collision exactly when it or a child owns polygons**; the file's bit 12 is a
  starting value.
- The node readers copy the file's `nparams` word into `+0x5c` verbatim (`FUN_00311880`, D:L212689-212697, the store at D:L212700): file bit 0
  is active, bit 12 the starting "holds collision", bits 13-17 the layer. **The port's reading of that word matches**
  (scene `src/probe.ts` `modelGate`: `m_active` bit 0, `m_hasDI` bit 12, region shift bits 13-17).
- The clutter path writes only bits 1 and 2 of `+0x5c` on its models (`FUN_00314760`, D:L214313-214314; `FUN_00314320`,
  D:L214186); bit 0 (active) is the file's. Whether game code ever switches a clutter master off is unread (it would
  switch every instance, the master being shared).

## 4. r0004 (W)

The r0004 served ELF (`game/r0004/served/socom2_game_served.elf` under the desktop tree, sha256 `ce5e7717...d200ec`)
against r0001's (`game/disc/socom2_game.elf`, sha256 `06b83684...98872`). Each twin found by the desktop's matcher
where it had one and confirmed by a scan of the whole r0004 image on the function's first 24 words, addresses masked;
the 34 globals the twins form map one to one between the builds.

| r0001 | r0004 | words (N, identical M, relocated K) |
|---|---|---|
| `FUN_002d3cf0` | r4 0x2f0c00 | 676, 619, 57 |
| `FUN_002d4780` | r4 0x2f1690 | 143, 99, 44 |
| `FUN_002d3030` | r4 0x2eff40 | 813, 758, 55 |
| `FUN_002d2890` | r4 0x2ef7a0 | 344, 304, 40 |
| `FUN_002dc620` | r4 0x2f9610 | 14, 14, 0 |
| `FUN_002d54f0` | r4 0x2f2520 | 10, 10, 0 |
| `FUN_002d93a0` | r4 0x2f63d0 | 57, 53, 4 |
| `FUN_003084f0` | r4 0x325890 | 33, 33, 0 |
| `FUN_00307fa0` | r4 0x325340 | 31, 17, 14 |
| `FUN_0031dd90` | r4 0x33b3a0 | 40, 39, 1 |
| `FUN_0031de30` | r4 0x33b440 | 15, 12, 3 |
| `FUN_0054f410` | r4 0x554360 | 86, 65, 20, and 1 actor-field offset: r4 0x554380 reads `+0x1344` where r0001 reads `+0x1340` (D:L417258); every r0004 function reading that field uses `+0x1344` |
| `FUN_003ca5a0` | r4 0x3ec740 | 399, 361, 38 |
| `FUN_003c7ee0` | r4 0x3ea060 | 127, 116, 11 |
| `FUN_005ac070` | r4 0x5b1d00 | 95, 85, 10 |
| `FUN_0060bc40` | r4 0x613440 | 179, 147, 32 |
| `FUN_00316e30` | r4 0x3343d0 | 137, 126, 11 |
| `FUN_002d49c0` | r4 0x2f18d0 | 149, 103, 46 |
| `FUN_002dc660` | r4 0x2f9650 | 8, 8, 0 |
| `FUN_0031dc90` | r4 0x33b2a0 | 42, 41, 1 |
| `FUN_0031de90` | r4 0x33b4a0 | 4, 2, 2 |

- The clutter loop's words (`+0xf0`, `+0xec`, `+100`) are identical in both queries (r4 0x2f14b8, 0x2f14f0;
  r4 0x2f1758, 0x2f1790), each call to its twin. The query, walk, queue and flush functions have the same callers in
  both builds.
- r0004 adds one caller: r4 0x5c93a4 (in an r0004-only block of `FUN_005c1970`'s twin) casts one immediate ray 25 units
  along a body's vector -- research 392's G7 throw-release clearance. It goes through the immediate query, so it meets
  clutter too.
- r0004 replaces only the two overlays; the maps are the retail disc's, and the r0004 map patches in the evidence are AI
  navigation only.
- The loader's twins:

  | r0001 | r0004 | words (N, identical M, relocated K) |
  |---|---|---|
  | `FUN_002d5060` (loads `clutter.zar`) | r4 0x2f1f70 (by its only caller: `FUN_00318da0`'s twin r4 0x336340 calls it at the same place) | 239 in r0001, **310 in r0004**; 123 identical, 39 relocated; the rest a grown frame (0x30), reassigned registers and **72 words of new code** in three blocks (below; the body grows by 71; the r0004 sweep's "+79" counts otherwise) |
  | `FUN_002d55c0` (files an instance in cells) | r4 0x2f25f0 | 186, 173, 13 |
  | `FUN_002d7b00` (the collision list or the other) | r4 0x2f4b30 | 33, 30, 3 |
  | `FUN_003130b0` ("holds collision") | r4 0x330650 | 100, 98, 2 |
  | `FUN_0031de80` (the level's finalisation) | r4 0x33b490 | 2, 1, 1 |
  | `FUN_00311880` (`nparams` to `+0x5c`) | r4 0x32ee20 | 72, 62, 10 |
  | `FUN_00317d90` (`+0xa1` bit 2) | r4 0x335330 | 75, 71, 4 |

- **r0004 drops one clutter instance on Sujo** (W; reading, pending review). The new code in the loader's twin: a flag
  set when the level's name begins `mp61` (r4 0x2f2108-0x2f2144); for each clutter type, a test of its name against
  `barrel_open` (r4 0x2f21b0-0x2f21d4); for each instance of that type, its position (`FUN_002d9490`'s twin) tested
  against (614, 30, 1134) within 1.0 on every axis, and a match freed with `FUN_002d55c0` skipped -- never filed in a
  cell, so neither collided with nor drawn (r4 0x2f2250-0x2f2304). On the disc that is Sujo's `barrel_open` record 8
  (the probe's bounds centred near (614.9, -, 1133.5)). Every other map, type and instance loads as in r0001. No
  research note recorded it before; the r0004 sweep names it in passing (`r0004-investigation/sweep-code-diff.md:198`).
  **The port follows r0004 (OT.R97)**: the instance is neither placed for drawing nor collided (CLT-2).
- `FUN_003130b0`'s twin is called from 116 sites in 84 functions in r0004, against 10 sites in 8 functions in r0001;
  the 8 match, and 106 of the r0004 sites (76 functions) lie in r0004's per-map patch block (r4 0x2d4280-0x2eb70c, research 383), which adds polygons and edits scene nodes and does not touch `clutter.zar`.

## 5. The census of the 22 maps (P)

The probe over the port's readers (tp2, all 22 maps): for every clutter model, its instances, its nodes' flags and its
polygons, each polygon's surface word put to the port's body test, `roundAdmits`, and the blast's two lines with the
material's penetration. Per map `tree-probe-<STEM>-partB.txt`, and `tree-probe-<STEM>-clutter-stoppers.csv` (one row
per instance with its world bounds; it lists only instances that stop a round or a blast line, so a body-only stopper
-- Sujo's `table_wood`, INVISIBLE_DI -- is in partB and the summary but not the CSV: tests are not built from the CSV
alone).

| map | clutter models, instances | instances with collision polygons | models with them |
|---|---|---|---|
| MP1 Blizzard | 12, 211 | **145** | 10 fir models (`alaska4d_tree*`); 2 card models (66 instances) none |
| MP82 Guidance | 22, 482 | **134** | telephonepole 27, barrelclosed 19, birch_near 15, snowyfirtree03 15, snowyfirtree01_near 12, snowyfirtree04 11, military_phone 10, alder_near 5, gate_barricade_pole 5, gate_barricade_pole_up 3, chair01 4, fallen_tree 2, garage_door_left 2, garage_door_right 2, corner_desk_sm 1, gate_metal_heavy 1 |
| MP61 Sujo | 14, 103 | **83** in 11 models; **82** in r0004 (section 4's barrel) | post_tele 27, palmtree01 15, barrel_open 14, drug_bricks 7, light_round_nosource 7, barrel_empty 6, palmtree02 2, tree_brazilian_nut2 2, light_round_nosource2 1, drug_stack_inside 1, table_wood 1 (9 INVISIBLE_DI polygons: a body's stopper only) |
| MP5 Abandoned | 10, 363 | **39** | palmtree 15, palmtree2 10, bananatree1 8, bananatree2 6 (all WOOD_THICK) |
| MP10 Blood Lake | 11, 439 | **3** | flagpoles |
| MP6, MP7, MP9, MP11, MP12, MP52, MP62, MP64, MP73 | some | 0 | rocks, grass and cards: no polygons |
| MP2, MP8, MP51, MP53, MP71, MP72, MP81, MP83 | none | 0 | -- |

- Every such model's root reads active with "holds collision" set, layer 0 (e.g. `0x90801053`), by the port's decode,
  which section 3 finds matches the original's.
- The port's hull holds 0 polygons under any clutter model's name, on every map.
- **Blizzard's firs**, e.g. `alaska4d_tree02b` (26 instances): 8 polygons, a trunk of 3 in WOOD_THICK (word `0x4c0e`,
  penetration 0, model space x -1.81..2.47, z -1.81..2.47, y 0..54.11) and boughs of 5 in SNOWY_TREE (word `0x600e`,
  penetration 0.7, not volumetric, a skirt of radius about 12, y 0..52), all steep, normals outward, no opposite twins
  ("partly open"). By the port's rules: a body walked at the fir is turned at the bough skirt's edge and slides round it
  about 10 units from the axis, never reaching the trunk (the dev-disc walk, CLT-2's leg b: off its line at 12.8 from
  the axis, closest 10.26, against a control without the clutter that crosses the trunk's axis at 0.43); a round strikes
  both (the boughs may be pierced), line 1 is stopped by the trunk and shortened by the boughs, line 2 is stopped by
  both. Whether the original holds the body at the boughs or lets it slide round is section 7's rig leg.
- **Bending clutter is among them** (corrected 2026-11-13; the first draft said none): on Guidance, 42 of the 134 are
  in the decomposed (bending) form with a repel angle (research 196) -- `birch_near` 15, `snowyfirtree03` 15,
  `snowyfirtree01_near` 12 (tp2 partB, each model's "in the decomposed form" count). The port places them at their
  authored pose (section 6, difference 6). No record on the disc is non-affine and none names a model its map's graph
  lacks (8a's collision census, cc3 at 86fc0dde69), so CLT.R1's skip drops nothing on the disc.
- **Guidance's `birch_near`** (15 instances): its node `di_invis` (a post about 2 x 20) carries 4 INVISIBLE_DI faces
  (word `0x0c12`) that stop a body, let a round over them (penetration exactly 1) and are seen through by line 2
  (`blastSeesThrough`); its 3 WOOD_THICK faces stop a body, a round and both lines. The 60 INVISIBLE_DI faces the room's
  see-through census gains on Guidance are these (research 388 s4's dated line).

## 6. What the port builds, and what differs

The build (task CLT-2): each placed clutter instance's model polygons, through the instance's matrix, with their own
surface words and materials, appended to the hull after the worldmodel's polygons (CLT.R2), with an owner per instance
node (`clutter/<model>#<record>`, CLT.R3), in the page's hull (`loadMap.ts`) and the room's (`simMap.ts`) alike, by one
shared function so the two stay identical. The queries need no change: the body's walk, a round's line and the blast's
lines already read every owner the grid files, with the materials and facing they apply to the world's -- provided each
clutter owner carries its own node's flags, as CLT-2's do. The port gates an owner on the file's bit 0 and bit 12
(`probe.ts` `modelGate`) where the original gates each node on its recomputed `+0x5d` bit 4 and skips the subtree; on the
disc they agree (all 197 clutter nodes of the 22 maps active, all 43 polygon-owning ones with bit 12 set, their 436
polygons the census's).

Named differences, not built:
1. **The cells an instance is filed in** (CLT.R4): the original files it in every cell its unrotated, scaled model
   bounds overlap (section 3); the port files every owner by its polygons' extent. They differ only where a turned
   instance's polygons leave its unrotated bounds -- there the original's query from a cell outside those bounds misses
   the polygon and the port's meets it.
2. **Non-affine records** (CLT.R1): a record whose params the port does not read as an affine matrix would be neither
   drawn nor collided, where the original reads the same 0x60 bytes for every record (`FUN_002d94b0`). A guard only:
   no record on the disc's 22 maps is non-affine (cc3; section 5), so it drops nothing.
3. **Facing**: inferred one-sided for clutter, as the world is read (section 2.5, amended; research 85 s5.1); the port keeps grenade flights two-sided on clutter as a labelled departure pending a capture (`GRENADE_INSTANCE_NODE_SIDES_READING`), and its per-query facing applies otherwise.
4. **An instance whose origin is off the grid**: the original files none (`FUN_002d55c0` D:L176288-176291:
   `FUN_002d9490`'s position, then `FUN_002d5b50` == 0 skips it); the port appends every affine instance, and its grid
   clamps one into the edge cells. Whether any of the 22 maps holds one is unread (the probe did not test it); a census
   line settles it.
5. **Downstream of the hull, owed** (CLT-2's review): the Forge's hide matches `clutter/<model>`, not the per-instance
   owners (LATER 999); the impact-sound surface set is built from the worldmodel alone (LATER 1000).
6. **Bending clutter's collision is static in the port**: Guidance's 42 bending instances (section 5) collide at their
   authored pose. In the original the walk reads the instance's live matrix (`FUN_002d93a0` at D:L175693 and D:L175696), so a
   bent instance would collide bent -- whether the bend writes that matrix is research 196's dynamic consumer, unread.
   The repel angles are 0.036-0.087 (about 2.1-5.0 degrees): `birch_near` 0.073-0.086, `snowyfirtree01_near`
   0.070-0.087, `snowyfirtree03` 0.036-0.052 (tp2 partB).

**What the clutter adds to the climb** (2026-11-13, the release gate's `climbCut.disc` snapshot, read off the box run
rq-cl2 at c122d0043c): every change is a `clutter/...` owner, no worldmodel wall's crossings moved. Climb faces 1441 ->
1615 (+174: clutter faces with appflags 4 or 5, crates and the like on the missions); four M81 `obligitory_crate` tops
cross four times on a level face (not a wall, so the original's two-crossing column holds on every climb wall and
ladder); 44 more walls whose column writes the fifth slot (78 -> 122: M73's chairs, garbage cans and tables, an M81
and a Sujo barrel). Whether the original climbs clutter as it climbs the world is the same walk (section 2), unmeasured.

## 7. What would settle it on the original (O, owed)

8a's Q8 on the Shadow PC's rig (r0004; Guidance's poles and barrels, Sujo's posts and drums, Blizzard's firs: a body run
into each, a round at each, a blast behind one), with three legs added by this lane: on Blizzard, a body aimed at a
fir's trunk and one passing about a metre beside it under the boughs (do the boughs stop a body, or only the
trunk?); a round through the boughs only and one into the trunk; the body's stand-off from a pole's centre. **What would
overturn this note: a body passing through a pole or a trunk on the original.**

### 7.1 Measured: a body at Blizzard's fir (O; LATER 1018)

**The rig's leg 1.** The rig's Q8 leg 1 ran on r0004 on the Shadow PC, 2026-11-13 16:15Z. Its files are under
`gate-runner/shadow/out/2026-11-13/1b-fir/`: six per-frame CSVs, a summary and the write log.
- **The set-up.** A standing SEAL was placed 45 u east of (1874.5, 1239.5) at (1919.5, 68, z), facing -x, with the
  stick held forward for 3 s by its own controller. Nothing was written during a run, and the feet, the velocity and
  the distance were read every poll.
- **The tree.** `alaska4d_tree02b` record 121, at (1875.09, 51.15, 1238.62), is a stored-matrix instance (not the
  decomposed form) turned about 70 degrees.
- **The geometry.** Its five bough triangles (SNOWY_TREE) meet at an apex 51.99 above the base. Their base edges form
  a pentagon whose east vertex is at (1886.42, 1242.74). The pentagon's south-east face runs from that vertex to
  (1882.51, 1229.12), and its north-east face to (1874.67, 1250.67).

| approach (start z) | the original, r0004 (three runs each) [proven: a trace of the original] | the port at `agent/v0421` 07d212f4fe [dev-disc test, `clutterCollision.disc.test.ts` (b2), (b3)] |
|---|---|---|
| head-on, 1239.5 | **stops**: closest 13.41 to (1874.5, 1239.5); ends at (1887.85, 60.52, 1238.22); z drift 2.0 or less; the stick forward to the end | meets the south-east face at x 1888.54 (tick 34); **slides south along it** to the face's south end at z 1228; rounds the fir at 11.86 and walks on west, ending at (1770.51, 35.03, 1227.64) |
| 6 u beside, 1245.5 | **slides round and passes**: closest 12.05 / 12.58 / 12.59; pushed to z 1252.06 while passing, then on west | meets the skirt at x 1888.54; slides south to the east vertex (z about 1242.3-1242.7), **then jams there**, flickering 0.3 u a tick between the two faces until the end: closest 13.44, end (1887.72, 61.27, 1242.36) |

- **Both meet the skirt at the same place.** The port touches it at x 1888.54; the original stops at 1887.85. The
  stand-off while rounding is close too: the port's 11.86 against the original's 12.05-12.59.
  - CLT-2 (b)'s 10.26 is measured from the trunk's box centre, on another line, and is not comparable.
  - The bough polygons alone account for the stand-off. The rig's "boughs or a collision cylinder" is its inference;
    nothing measured asks for a cylinder.
- **Two differences remain:**
  - Head-on, the original holds the body where the port slides it along the face. The hit is 16 degrees off the face's
    normal.
  - Beside, the original slides off the north-east face and round. The hit is 56 degrees off. There the port's body
    is carried south to the corner by a side line's hit (line 2, the only hit for ten ticks) and jams.
- **The port's rule, as built.** The segment solver is research 217 s2.9 (`resolveSegments` in `mover.ts`). On the
  ground it takes each hit's whole normal part out of the displacement (D:L413557-413567). It then runs the
  look-ahead (D:L413673-413800) from the feet plus `step_height` along that tangent move, which passes outside a
  convex cone narrowing upward. Head-on there are at most two hits a tick in the port (the centre line and one side
  line), so the jam rule (over `jamHits` 2 hits with depth over 1, D:L413602-413614) never puts the body back.
- **Why the original stops is unread.** Candidates, each a reading still to make:
  - The original's head line (or both side lines) also meets the face head-on, making three hits, so the jam puts the
    body back each frame. Against this: the head line's end is still `HEAD_LINE_MUZZLE_READING`, pending a read of
    `+0x458`.
  - A slide limit tied to the face's steepness, or to its material (SNOWY_TREE), which would be clutter's alone.
  - Something outside `FUN_005483d0`.
  
  **Ruled out at the source:** that the look-ahead runs along the move before its normal part is removed. The hit
  loop writes the reduced displacement back to `+0x3d1..+0x3d3` (D:L413597-413599), and the look-ahead reads that same
  field (D:L413674-413676), so it runs along the tangent move, as the port's does (the fresh review of this section,
  2026-11-13).
  
  That the difference is the general solver's on every steep face, not clutter's, is an inference: the material
  candidate would make it clutter's. The fix is LATER 1018, v0.4.22, a mover change measured against every wall's
  suites. For scale: at `step_height` over the feet (61.3 here; the base is 51.15), the cone's section is about two
  thirds (0.68) of the base pentagon.
- **Owed:** count the original's hits per frame on both approaches, and whether its displacement `+0xf44..+0xf4c`
  is zeroed at the stop (an RDRAM read on the rig, queued as F51). Then read the material and slide rules against
  `resolveSegments`.

## 8. Sources

- The r0001 reading: `FUN_002d3cf0`, `FUN_002d4780`, `FUN_002d49c0`, `FUN_002d3030`, `FUN_002d2890`, `FUN_002dc620`,
  `FUN_002dc660`, `FUN_002d54f0`, `FUN_0031dd90`, `FUN_0031dc90`, `FUN_0031de30`, `FUN_0031de90`, `FUN_0054f410`,
  `FUN_003ca5a0`, `FUN_003c7ee0`, `FUN_005ac070`, `FUN_0060bc40`, `FUN_002d5060`, `FUN_002d55c0`, `FUN_002d7b00`,
  `FUN_003130b0`, `FUN_0031de80`, `FUN_00311880`, `FUN_00316e30`, `FUN_00317d90`, `FUN_002dc1d0`, `FUN_002d4cc0` at the
  lines above; 8a's first reading (relayed 2026-11-13), three of whose cites this note corrects (the gate's line, what
  `FUN_002d54f0` returns, where the actor bit is read).
- The probe: `agent-mail/evidence/tree-probe/tp1` and `tp2` (the box runs at `agent/v0421` df3af7bd64).
- Research 196 (s2.1, s2.4), 367 (s4), 400 (lines 330-352), 281 (the polygon test's vtable target), 392 (G7), 398 (s1),
  84 (s13), 404 (the twin form).
