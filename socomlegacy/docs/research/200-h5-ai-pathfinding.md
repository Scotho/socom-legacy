# 200 -- H5 -- The AI-map path planner (A*, smoothing, following), transcribed for the hostage port

- Research date: 2026-10-04 (research wave 1, round 2 and the close; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/H5-ai-pathfinding.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/LEDGER-ALL.tsv`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: no verifier sampled H5; it is validated against the AIMAPS of MP6 and against routes the console itself computed (§4). Its corrections to H1 (189) and H4 (199) are in research 206 §1.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WT`; the archive's absolute root is dropped; references to the other reports are links to their notes; the claims research 206 §1 overrides are named under this header. The substance is verbatim.

Agent H5, research wave 2026-10-04. Read-only. Sources: the r0001 decomp `socom2_game.elf.decomp.c` (cited `D:L<line>`),
its disassembly (r0001 `game/disc/socom2_game.elf`, cited by address where the decomp dropped blocks), the ELF's
`.data`, the SOCOM 1 demo's DWARF1 (`SCUS_972.05`: struct and enum names, the same engine), the 22 `MP*.ZDB`
AIMAPS, and four RDRAM dumps that hold **console-computed routes** (`logs/parity/spawn_pcsx2.rdram` and three recomp
dumps). Scripts and outputs: `scratch/H5/` (README lists each one). No decompiled text is quoted. Nothing was built, run
in PCSX2 or written outside this folder.

**Headline.** The planner is fully read and transcribed. The A* is `FUN_00510ff0`, not `FUN_00526540` (H1 ([189](189-h1-hostage-ai-animation.md))). An
8-connected grid, integer costs `trunc(10 x fcost)`, a 10 x Manhattan heuristic, an MSL binary heap and four
"planners" (cost models). The transcription replays **console-computed routes from a PCSX2 RDRAM dump to the node**:
on the same map, the replay's nodes added and removed, open-list remainder, path length and path cost equal the
console's on 2 of 3 PCSX2 routes, and on 6 of 8 routes over 3 dumps. The remaining one is one node off at equal cost.
The match holds only with the EE's round-toward-zero float; IEEE rounding misses every cost (§4.2). On MP6 the
transcription routes every hostage out of the jail **through the doorway (102..103, 10)**:
- hostageStart to the Safety zone's centre: 146 raw cells, 1,686 units; 1,658 units after smoothing (28 waypoints).

## 0. Summary table

| # | item | status | grade | answer |
|---|---|---|---|---|
| 1a | Graph | RESOLVED | PROVEN | One grid per sub-map, 10-unit cells, **8 neighbours** in DIR order N NE E SE S SW W NW (dx,dz table 0x64f910). A route between sub-maps is planned leg by leg over a link graph: Dijkstra on link cells, with intra-map edges weighted by A* lengths. |
| 1b | Step cost | RESOLVED | PROVEN (code) + capture-confirmed | `g += trunc(10 x fcost)`. Base fcost 1.0 is x1.3 diagonal. Target soil 6 or an occupied cell: 2.5; soil 13: 25; dynamic-occupied: 50; uphill with a steep cell at either end: 10. BASIC adds 1.5 x bias (5 into water/climb, nothing into road); STEALTH and RESTRAINED differ (§1.3). **The escortee online uses BASIC**: 25 straight, 27 diagonal on default ground (EE rounding). |
| 1c | Heuristic | RESOLVED | PROVEN | `h = 10 x (|dx|+|dz|)` (0x5102e0). Admissible. |
| 1d | Open/closed, tie-break | RESOLVED | PROVEN + capture | The open list is an MSL binary heap of {cell, g, h}, keyed g+h, with strict `<` sift-up and `<=` sift-down stop (it prefers the right child on ties). Decrease-key is a linear scan of the heap array. Closed cells are never reopened (f=-1); the start cell can be re-pushed once (quirk). |
| 1e | Limits / slicing | RESOLVED | PROVEN | The open heap holds 1024 entries, the closed list 24576 (`FUN_005128f0`). Slicing is per frame: a budget of 33 RCNT0 ticks (timer 0 counts H-blanks), about 2.1 ms, shared by every queued route (task "ai_route_planner"). A route fails at 200 slices. CAiPath+0x8c (node-search) and +0x90 (slice) limits are 0 (off) for the follower. |
| 1f | Failure | RESOLVED | PROVEN | CAiPath state 5 FAILED with +0x81 = 2 (200 slices), 3 (limits), 4 (open list empty = no route) or 6 (a list full). The follower then waits 2.5 s and replans (H4 ([199](199-h4-hostage-closures.md))). |
| 1g | Post-processing | RESOLVED | PROVEN / capture-confirmed | Points are stored goal-first. Smoothing is greedy string-pulling per leg, with a 0.2-cell line walk that refuses blocked, collision, occupied and uphill-steep cells. Then compaction and point flags (LINK, ACTION, COVER). The follower smooths a second time (`FUN_00526540` = re-leg + smooth). H1's "lateral walkability test": `FUN_00524760` is a **corridor** test (inside a trail point's width) and `FUN_0052a090` is the soil test. |
| 2 | Cell bits | RESOLVED | PROVEN | The CAiCell bitfield is named by the SOCOM 1 DWARF: soil 0-4, occupied 5, name 6, action 7, link 8, altitude 9-18, ... A* parent direction 28-31, f/g in the second word. Every bit the planner reads matches the SOCOM II code, and name/action/link agree 100% with the file's tables over 946,155 cells. **Not traversable: soil 0 nogo, 8 clutter, 9 trans, 10 noalt.** The jail bars are soil 9: **not** walkable (corrects H4 §6). |
| 3 | Consumption | RESOLVED (rules) / PARTIAL (steering gains) | PROVEN / STRONG | Steering targets the last stored point; arrival removes it. A point is dropped on reaching its cell, on crossing it within its width, or on passing it. Throttle drops to 0.35 at a LINK point and to 0 at an ACTION point. A DOOR action cell gets no special handling (jump table, type 0 → default). Sub-maps are changed by walking onto a link cell. Replan triggers are H4's (§3.3). |
| 4 | Validation | RESOLVED | capture | M51 PCSX2 dump: 2 of 3 routes reproduce stats exactly; the third is one node off at equal cost. 7 of 8 smoothed point lists agree once the planner's own occupied cell is restored. MP6: all three hostages exit through the doorway; the routes are listed in §4.1. |

---

## 1. The A* and everything it calls

### 1.1 Call chain (who plans, where, when)

- **The request.** The follower sub-state 0 calls `FUN_005623b0(ctrl, G)` (D:L508815; `FUN_005623b0` D:L426791). It
  returns early in three cases:
  - G is the follower's own cell: success with an empty path;
  - G is not traversable (`FUN_0052a090`): no plan. The path stays UNKNOWN, so sub 2 sees a failure and waits
    2.5 s;
  - otherwise it calls **RegisterPathPlan** `FUN_0052c5b0` (12-byte thunk, count = 1) → `FUN_0052c5c0`
    (D:L396352) on the CAiMaps global 0x66a1b0.
- **The path type.** It is set by `FUN_005627e0` (D:L426946) through `SetPathType` `FUN_00524cd0`, and a change sets
  CAiPath+0xc (bias) = 1.0.
  - ctrl+0x264 bit 1 set → DEFAULT, or STEALTH in AI state 8. Bit 1 is copied from body+200 bit 1 at attach
    (`FUN_00573130` D:L434791).
  - Otherwise RESTRAINED offline when body+0x105d bit 0 is set; **BASIC (1) online** (DAT_0045a0c1 = the multiplayer
    flag).
  - The escortee's team word 0xC0020000 has bit 1 clear, so **an escortee online plans BASIC**. STRONG: the code
    path plus the team word; the M51 dump's AI paths are type 1 too.
- **RegisterPathPlan** `FUN_0052c5c0`:
  1. It checks that the start and every goal cell are traversable (`FUN_0052a180` map lookup + `FUN_0052a090`).
  2. `PathPlanBegin` `FUN_00510cc0` (D:L382409) resets the path (`FUN_00527970` plan_setup).
  3. Per leg: on one sub-map, `PathPlanAddLeg` `FUN_00510c80` → `FUN_005274b0` (plan_addleg, D:L393462). Across
     sub-maps, the link-graph route (§1.2), then one AddLeg per consecutive same-map pair.
  4. On success `FUN_005109d0` (commit, D:L382237) queues the path, sorted by its float priority CAiPath+0x18. It
     then sets planleg = legcount-1, so **legs are planned last-first**.
  5. On failure `FUN_00510c30` (abort).
- **plan_addleg.** It refuses a leg whose ends are untraversable (`FUN_00511f40`). With app flag 0x20 and a ROUTER
  graph (map+0x15c, region kind 4) it splits the leg through ROUTER regions. No MP map has a kind-4 zone (research
  75 §5.4: kinds 1 and 5 only), so for MP the leg is stored as-is: waypts vector +0x34 (from, to), maps vector +0x40.
- **The planner queue task** `FUN_00510570` (D:L382029) is registered per frame as **"ai_route_planner"** (string
  0x3e2010, priority 10.5, D:L50931).
  - It runs while the queue is non-empty and `RCNT0 - start < DAT_0064f8d8`. That value is **33** (.data 0x64f8d8 =
    0x21), and RCNT0 mode 0x83 (D:L249334) selects the H-blank clock, so the budget is about 2.1 ms a frame.
    BELIEVED: the hardware meaning of clock select 3.
  - An INQUEUE path (state 1) gets its planner created (`FUN_00510e40` D:L382474), and `find_path` runs to the time
    limit.
  - A finished leg deletes the planner (`FUN_00512560` D:L383103: resets every touched cell to dir 8 and f = g = -1),
    then `plan_complete` `FUN_005273c0` (D:L393419). That queues the next leg or finalises (`FUN_005278c0` →
    post-process `FUN_005267a0`).
- **`PathPlanImmediate`** `FUN_00510390` (D:L381943) runs the same with an unlimited budget. The link-graph builder
  uses it.
- **The planner object** (`FUN_00510e40`): [0] the cost model (by CAiPath+9; vtables below), [1] the leg's CAiMap,
  [2] the start cell, [3] the goal cell, [4] → CAiPath+0x4c stats.

| CAiPath+9 (PATH_TYPE, demo DWARF) | vtable | RTTI name | +0x14 traversable | +0x18 fcost |
|---|---|---|---|---|
| 0 DEFAULT | 0x669120 | CAiPlanner | 0x510350 | 0x512930 |
| 1 **BASIC** (escortee online) | 0x669180 | CBasicPlanner | 0x510350 | 0x513080 |
| 2 STEALTH | 0x669160 | CStealthPlanner | 0x510350 | 0x512dc0 |
| 3 RESTRAINED | 0x669140 | CRestrainedPlanner | 0x512cb0 | 0x512930 |

The other slots are shared: +8 setup 0x510280 (no-op), +0xc is_goal 0x510290, +0x10 heuristic 0x5102e0. These four
functions are absent from the decomp's function list (they are reached only through the vtables); read by
disassembly (`scratch/H5/disasm.py r0001 510280 510390`).

### 1.2 The graph

- **Nodes.** The stored cells of one sub-map (research 75 §4: the row table {x0, x1, first}). A cell outside the box or
  outside its row is absent and never entered (`FUN_00511f80`, `FUN_005121c0` D:L383007).
- **Edges.** 8 directions, in the order of the default list 0x64f8f0 = {0..7}. The (dx,dz) table at 0x64f910 is N(0,-1)
  NE(1,-1) E(1,0) SE(1,1) S(0,1) SW(-1,1) W(-1,0) NW(-1,-1). The DIR names come from the demo DWARF
  (`out_demo_path_enums.txt`) and match research 75's facing convention.
  - **No corner-cutting test**: a diagonal step checks only its target cell. PROVEN by absence:
    `FUN_005121c0` + traversable read whole.
- **Action cells** (cell bit 7, record in the map's action table +0xfc/+0x100, 40 bytes, `FUN_00530d10`).
  - **Leaving** an action cell: type 6 SATCHEL exits only along its direction. Type 1 WINDOW and 4 MPBOMB exit only
    along dir or dir+4. Any other type with dir ≠ 8 tries the 8 directions in the order dir, dir+4, dir+1, dir-1,
    dir+5, dir+3, dir+2, dir-2 (0x64f8f8.., D:L382688-382720). A type_invalid bit (+8 bit 4) reads as type 0.
  - **Entering** a WINDOW or MPBOMB cell with dir ≠ 8 is allowed only along dir or dir+4.
  - Type names: the SOCOM II action-name switch D:L157334-157362, `out/action_type_names.txt`: 0 DOOR, 1 WINDOW,
    2 SWITCH, 3 DEFUSE, 4 MPBOMB, 5 ACT_BREACH, 6 SATCHEL, 7 ITEM.
  - MP data: 35 action cells, all type 1 WINDOW except **MP6's single DOOR at (102,10) dir 6 (W)**
    (`out/action_records.txt`).
- **Sub-maps** (`FUN_0052a8c0` CreateGraph, D:L395320; search `FUN_002d14a0` D:L173667 → `FUN_002d1790` D:L173781).
  - A node per link record. Each link has a zero-weight edge to its twin on the other sub-map. A link whose word's
    low nibble is a direction (≠ 8) becomes one-way, in the direction whose neighbour cell is traversable. **All 16 of
    MP6's link words are 8, i.e. two-way.**
  - Every pair of links on one sub-map is joined with weight = `GetLength` (`FUN_00527e70`, the Euclidean polyline
    length in cells) of a `PathPlanImmediate` route between them (DEFAULT planner, fresh CAiPath `FUN_00528340`).
  - Per request, temporary edges join the start to every link on its sub-map, and every link on the goal's sub-map
    to the goal, weighted by Manhattan distance (D:L396440-396485).
  - The search is a Dijkstra with linear minimum extraction. Cost = edge+4 x edge+8 (weight x factor); edges are
    filtered by the mask CAiPath+0x24 (retried with no mask on failure); a one-way flag 0x40000000 applies.
  - Each consecutive same-map pair on the result becomes a leg.

  Grade: PROVEN for the structure and weights; STRONG for the Dijkstra detail (`FUN_002d1790` read in part).

### 1.3 Cost per step

`g_new = (int16)(g + cvt.w.s(10.0 x fcost(from, dir, to)))` (0x5116c8-0x5116f4, D:L382742). `cvt.w.s` truncates.

**Base fcost** `0x512930` (CAiPlanner; also RESTRAINED's):
1. If the from or the to cell is soil 11 *steep*: compare the altitudes. Altitude is `min.y + scale x m_altitude`
   with scale = (max.y-min.y) x 0.000976563 (D:L387628; map+0xe8). Going up (to > from) **returns 10.0** (no
   diagonal factor). Otherwise continue at step 3 with c = 1.0.
2. Else, on the target cell:
   - if `m_occupied` and the cell lies in a footprint of the dynamic occupancy list (0x66a0bc, `FUN_00515750`;
     filled by `FUN_00510530` from `FUN_003adab0`): return **50.0**;
   - else soil 13 *collision*: return **25.0**;
   - else soil 6 *climb*: c = **2.5**;
   - else `m_occupied`: c = **2.5**;
   - else c = 1.0.
3. If dir is odd (diagonal): c = 1.3f x c (0x3fa66666 at 0x512c60).

**BASIC** `0x513080`: b = base.
- If the target is soil 3 *road*: return b.
- m = 2 if the source is road, else 1.
- Target soil 2 *water* or 6 *climb*: return b + 5.0·m (0x64f8e0).
- Otherwise: return b + bias·(1.5·m) (0x64f8e8 = 1.5; bias = CAiPath+0xc, copied to 0x64f8d0 per call, D:L382636;
  1.0 after SetPathType).

**STEALTH** `0x512dc0`. "Cover" = soil ∈ {2 water, 4 brush, 5 forest, 12 grass} (mask 0x40d on soil-2) and no
action bit and no link bit.
- From cover to cover: max(0, b − 0.5·bias·b).
- Non-cover to cover: b.
- Into non-cover: b + bias·b.
- The request sets bias 0 when Manhattan > 200 (D:L426912-426925).

**RESTRAINED** traversable `0x512cb0`: the base set, minus soil 6 *climb*, minus a WINDOW cell in state 0. It also
clamps search_limit (+0x8c) to ≤ 5000.

**Floating point.** The R5900 FPU rounds every operation toward zero. That makes 10 x 1.3f = 12.9999990 → **12**, not
13. **The console captures confirm it**: the four distinct PCSX2-and-recomp routes cost 174 and 194, which the EE
replay reproduces exactly and the IEEE replay misses (186, 206). Source: `out/rdram_validate_spawn_pcsx2_ieee_clearocc.txt`.

| integer step (from soil 1) | DEFAULT straight / diag | BASIC straight / diag |
|---|---|---|
| default 1 / stairs 7 | 10 / 12 | **25 / 27** |
| climb 6 | 25 / 32 | 75 / 82 |
| collision 13 | 250 / 250 | 265 / 265 |
| uphill into a steep cell | 100 | 115 |

(`validate_mp6.py` prints the first three rows for both rounding modes.)

### 1.4 Heuristic, goal

- `h = int16(10·(|dx|+|dz|))` (0x5102e0). Equal to the straight step cost of DEFAULT, below every BASIC cost.
- `is_goal`: x and z equal; the sub-map index is ignored (0x510290). PROVEN.

### 1.5 Open/closed structures and tie-breaking

- **Open heap.** 8-byte entries {loc u32, g s16, h s16} at DAT_0066a0f0 (count 0x66a0ec, capacity 0x66a0e8 = 1024).
  Key = g+h as int.
  - push = `FUN_005132b0`: sift-up while key < parent.
  - pop = `FUN_00513460` + `FUN_00515270`. Two entries: swap. Otherwise the last entry fills the hole from the root
    down: take the right child unless the left key < right key; stop when the moving key ≤ the child's.
- **Cell state.** The cell's second word = `m_astar_f`/`m_astar_g` (s16 each), and `m_astar_dir` = bits 28-31
  (8 = unvisited). The file ships 8 / -1 / -1 on all 946,155 cells (`out/census.txt`).
  - Pop: f := -1 (closed).
  - Push: dir := (d+4)&7 (the way back), f := g+h, g := g.
- **Closed list.** 0x66a108, capacity 24576; it only records the popped cells, for the reset.
- **Expansion.** A neighbour with dir 8 is pushed. A neighbour with f ≠ -1 and g_new < g gets decrease-key:
  - a linear scan of the open array (`FUN_005123a0` D:L383059) counts `nodes_searched` per entry examined;
  - then dir, g, f and the entry's g are updated and the entry is sifted up.

  A closed neighbour (f = -1) is skipped. The start cell keeps dir 8, so a neighbour can push it again. The
  transcription keeps this quirk; it only affects counts.
- **Order of work per pop.** Copy the root; pop; mark the cell closed; append it to the closed list (fail 6 if
  full); `nodes_removed++`; `current = cell`.
  - If `is_goal`: done.
  - Else check the limits (§1.6), then expand in the direction order of §1.2.
- **Stats** (CAiPath+0x4c; names from the demo DWARF `CAiPathStats`): nodes_searched, nodes_added (start included),
  nodes_removed, nodes_visited (closed count at the end), nodes_left (open count at the end), path_length (backtrack
  steps), path_cost (goal g), ticks (slices). These are what §4.2 compares.

### 1.6 Limits and time slicing

| limit | value | source |
|---|---|---|
| frame budget | 33 RCNT0 H-blank ticks (all queued routes) | .data 0x64f8d8; RCNT0 mode 0x83 D:L249334 |
| slices per route | `ticks ≥ 200` → FAILED code 2 | D:L382674, 0x51135c `slti 0xc8` |
| node-search limit | CAiPath+0x8c (0 = off; RESTRAINED clamps it to ≤ 5000); exceeded → code 3 | D:L382675 |
| slice limit 2 | CAiPath+0x90 (0 = off) → code 3 | D:L382676 |
| open heap | 1024 entries, full → code 6 | `FUN_005128f0` D:L383238 |
| closed list | 24576 entries, full → code 6 | D:L383239 |

The follower's CAiPath is built by `FUN_00528340` (D:L393996, via `FUN_0060bf40` D:L516817 at ctrl+0x46c). It sets
+0x8c = +0x90 = 0, bias 1.0 and **app flags 3**.

Measured on PCSX2 (M51 dump, `out/rdram_paths.txt`): a 964-pop search took ticks = 7 slices, about 140 pops a frame
with 24k decrease-key scan steps. The jail-to-Safety search of §4.1 is ~5,800 pops. At that rate it would take
~40 slices, well under 200 (BELIEVED extrapolation). The follower plans to a goal near its leader, so its searches are
short.

### 1.7 Failure

`CAiPath+0x80` = 5 FAILED and +0x81 = the code (D:L382856):
- 2: 200 slices;
- 3: a search limit;
- 4: the open list emptied, i.e. no route;
- 6: a list overflowed.

Code 5 is "out of time this frame": the state stays PLANNING (2) and the route resumes next frame.
In CAiSFollow sub 2, any state other than COMPLETE with points goes to sub 8: a 2.5 s wait, then replan (H4 §4).

### 1.8 Post-processing

1. **Backtrack** (D:L382790-382845). From the goal, follow `m_astar_dir` through the 0x64f910 table, appending each
   cell (with the sub-map index) to the points vector +0x98, until the start; then append the start. A reversal
   guard stops on dir == previous+4. **Points are stored goal-first**, and legs accumulate last-leg-first, so the
   vector reads end → beginning. The follower consumes from the back (`FUN_00524d00`).
2. **On completion** `FUN_005278c0` → `FUN_005267a0` (D:L393171):
   1. **SmoothPath** `FUN_00526380(path, 0)`, which runs only when app flag bit 0 is set (the follower's flags = 3,
      so yes);
   2. **UpdatePointFlags** `FUN_00525520` (D:L392594);
   3. **UpdatePathWidth** `FUN_00525340(path, 5)` when app flag 4.
3. **SmoothPath** (`FUN_00526380` D:L393020), for COMPLETE paths: **SmoothPathLeg** `FUN_00525810` (D:L392683) on
   every leg, then compaction `FUN_00527ce0` (D:L393777: drop points whose loc is the null loc 0). **SmoothPathLeg**,
   for a leg spanning stored indices [e..s] (s = the leg's start end) when s−e > 2:
   - anchor a = s; for i = s−1 down to e+1:
     - the shortcut is a candidate unless P[a], P[i] or P[i−1] is "gated";
     - gated = an action cell of type WINDOW or MPBOMB (or ITEM, for P[i]), or a no-action cell of soil 6 climb;
     - a candidate needs the **line walk** P[a] → P[i−1] to pass;
     - if it passes, P[i] is deleted (set to the null loc); else a = i.
4. **Line walk** `FUN_00537e50(0.2, map, A, B, FUN_00525c80, ctx)` (D:L403319).
   - Endpoints: cell centres. An action cell with m_offset ≠ 8 is nudged 0.75 units along GetDirVec(offset)
     (0x65b030, `FUN_00519130`).
   - Sampling: every 0.2 x cell = 2 units in x,z, from t = 0 to 1; each sample's cell is `trunc((p−min)/cell)`.
   - Leaving the box or entering an unstored cell fails the walk.
   - Each **new** cell goes to the callback `FUN_00525c80` (D:L392827). The cell must:
     - be traversable, not soil 13 and **not m_occupied**;
     - not be an uphill step onto a steep (11) cell;
     - with app flag 8, lie inside the template path's corridor (`FUN_00524760` on CAiPath+0x10, the leader's trail
       when following).
   - At t = 0 it records whether the start and end cells are "preferred" (`FUN_00526310`: STEALTH = cover soil,
     BASIC = road, else every cell). Afterwards: with neither or only the start preferred, the cell must not be
     preferred; with only the end preferred, likewise, except the end cell itself; with both preferred, it must be
     preferred.
   - For BASIC on MP maps, which have no road soil (`out/census.txt`), this reduces to "plain walkable cells".
5. **UpdatePointFlags.** Point byte +5:
   - bit 1 LINK on both points around a sub-map change;
   - bit 0 ACTION on a point whose next point (toward the goal) is an action cell;
   - bit 2 COVER when that next cell is cover soil.

   Point byte +4 = width: `GetLocationWidth` `FUN_005396c0` (D:L403994), called with 5, only with app flag 4.
   Research 333 corrects the earlier bound: five clear rings return 6 (D:L404083-404092).
6. **In the follower**, sub-state 2 → 3 calls `FUN_00526540(path, maps, 1)` (D:L393116, D:L508832). It rebuilds the leg
   table from the points (one leg per run of one sub-map) and calls `FUN_00526380(path, 1)`: a **forced second
   smoothing**. This is what H1 called the A*.

### 1.9 Language-neutral pseudocode (port this)

```
const DX = [0,1,1,1,0,-1,-1,-1], DZ = [-1,-1,0,1,1,1,0,-1]          // 0x64f910 (N NE E SE S SW W NW)
const OPEN_CAP = 1024, CLOSED_CAP = 24576, MAX_SLICES = 200           // FUN_005128f0; D:L382674
traversable(c) = soil(c) >= 11 or soil(c) not in {0,8,9,10}           // 0x510350 (RESTRAINED: also !=6, see 1.3)
fcost: see 1.3 (all arithmetic in float32, rounding toward zero; 1.3 = 0x3fa66666)

plan_leg(map, start, goal, model):                                    // FUN_00510ff0
  reset touched cells to dir=8, f=g=-1 (they are reset after every plan: FUN_00512560)
  open = heap of (cell, g:int16, h:int16) keyed g+h ; push (start, 0, h(start)); start.f=h(start); start.g=0
  closed = []; stats = zero; stats.added = 1
  loop:
    if open empty: return FAILED(4)
    (cur, gcur, _) = open.root ; open.pop()                           // MSL pop, 1.5
    cur.f = -1 ; if |closed| == CLOSED_CAP: return FAILED(6) ; closed.append(cur) ; stats.removed++
    if cur.x == goal.x and cur.z == goal.z: break
    if slices >= MAX_SLICES: return FAILED(2) ; if limits exceeded: return FAILED(3)
    dirs = 0..7, or the action-cell order of 1.2
    for d in dirs:
      n = (cur.x+DX[d], cur.z+DZ[d]); if n not stored or not model.traversable(n): continue
      if occupied(n) and appflags & 0x10: continue
      if action(n) in {WINDOW, MPBOMB} with dir a != 8 and d not in {a, a+4 mod 8}: continue
      g2 = int16(gcur + trunc(10 * model.fcost(cur, d, n)))
      if n.dir == 8: n.dir=(d+4)&7; n.f=g2+h(n); n.g=g2; if |open|==OPEN_CAP: return FAILED(6); open.push((n,g2,h(n)))
      elif n.f != -1 and g2 < n.g: k = linear index of n in open; n.dir=(d+4)&7; n.g=g2; n.f=g2+h(n); open[k].g=g2; sift_up(k)
    (time budget: stop the slice when 33 H-blanks have elapsed since the frame's planner task started; resume next frame)
  pts = []; c = cur; last = 8
  while c != start: if last != 8 and c.dir == (last+4)&7: break; pts.append(c); last = c.dir; c = c + (DX,DZ)[c.dir]
  pts.append(start)                                                   // goal first, start last
  return COMPLETE(pts, cost = gcur, length = |pts|-1)

smooth_leg(pts, e, s):  // pts goal-first; s = index of the leg start      FUN_00525810
  if s-e <= 2: return
  a = s
  for i = s-1 downto e+1:
    if gated(pts[a]) or gated_mid(pts[i]) or gated(pts[i-1]) or not line_walk(pts[a], pts[i-1]): a = i
    else: pts[i] = DELETED
  remove DELETED                                                      // FUN_00527ce0
```
The runnable reference is `scratch/H5/aimap_planner.py` (`find_path`, `smooth`, `line_walk`, the four cost models,
EE/IEEE float modes). Each rule carries its address in a comment.

---

## 2. Cell walkability and the cell word

**The layout** comes from the SOCOM 1 demo's DWARF `struct CAiCell` (8 bytes; `out_demo_caicell.txt`, reader
`demo_dwarf1.py`). The DWARF bit offset counts from the LSB; this compiler's convention is checked against every
bit the SOCOM II code reads. **Census over all 22 MP maps** (`census.py` → `out/census.txt`): 946,155 stored cells.

| bits | DWARF name | read by the planner | meaning / values (22 MP maps) |
|---|---|---|---|
| 0-4 | `m_soil` | traversable, fcost, smoothing | names from `FUN_005187e0` (D:L386089, `out_soil_names.txt`): 0 **nogo** 88,845 · 1 default 540,045 · 2 water 0 · 3 road 0 · 4 brush 2,157 · 5 forest 0 · 6 **climb** 148 · 7 stairs 667 · 8 **clutter** 178 · 9 **trans** 10,062 · 10 **noalt** 271,395 · 11 **steep** 32,286 · 12 grass 6 · 13 collision 0 · 14/16/19/20/24 (unnamed; "default") 366. **Bold** = blocked (0, 8, 9, 10) or special (6, 11). |
| 5 | `m_occupied` | cost 2.5 / 50; smoothing refuses; app flag 0x10 blocks | 43 in the files (the start points and hostage starts). At run time every body marks its cell: `SetOccupied` `FUN_00529a90` (D:L394767) from `UpdateAiMapLoc` `FUN_005b7ba0` (D:L471327) when body+0xe1 bit 4 is set, which is the base-object default (D:L145030). The M51 dump shows 30 of 30 AI body cells marked, plus 1 (the player) (`out/rdram_occupied_spawn_pcsx2.txt`). |
| 6 | `m_name` | -- | 206 = exactly the named-point cells (100% agreement) |
| 7 | `m_action` | exit/entry rules, smoothing gate, point ACTION flag, follower jump table | 35 = exactly the action ("marker") records (100%) |
| 8 | `m_link` | stealth cover test | 108 = exactly the link records (100%) |
| 9-18 | `m_altitude` | steep-cell cost, smoothing uphill test | y = min.y + (max.y−min.y)/1024 · value (D:L387628). The M51 dump's map+0xe8 = 704.41/1024 = 0.68791, as computed. |
| 19-20 | `m_boundary` | no | 0/1/2/3 = 945,537/63/279/276 |
| 21 | `m_mes` | no | 91,837 set |
| 22-23 | `m_shadow` | no (render consumer below) | 0..3; feeds model darkness outside the planner |
| 24 | `m_inside` | no | 46,791 set |
| 25 | `m_badalt` | no | 109,078 set |
| 26 | `m_rtflag` | no (reset helper) | 0 everywhere |
| 27 | `m_bilinear` | no | 130,870 set |
| 28-31 | `m_astar_dir` | A* parent | 8 on every cell (the "bit 31 set" of research 75 §4) |
| word 2 | `m_astar_f` s16, `m_astar_g` s16 | A* | 0xFFFFFFFF everywhere (research 75 §4) |

- **Grade.** PROVEN for each bit the planner reads: the DWARF name and the code agree, and the census agrees with the
  tables. The planner does not use every named field; the render consumer of `m_shadow` is read below.
- **R4B-00 correction (2026-11-04; reading, pending review): `m_shadow` feeds model darkness.** The table's
  "no" means "not read by the planner", not "inert in the game". `FUN_0052d270` (D:L396805-396808) extracts
  bits 22-23. `FUN_0052ce10` (D:L396671-396784) samples up to four neighbouring cells with bilinear weights,
  re-normalises when accepted weights sum below 0.98, and scales by `1/3`; a missing sub-map returns 1.0,
  while failure to obtain the local interpolation gives 0.0. With its fourth argument enabled, an `m_inside`
  cell is treated as shadow 3 (`FUN_0052d280`, D:L396814-396817). In the body update `FUN_005af930`, when the
  shading path is enabled and its override is negative, the sample is clamped and the model's `+0xa0` is set
  from `(1 - sample) * 127` (D:L466988-466993). Thus the field has a render consumer even though A* ignores it.
  This is a static retail-code reading, not a measured brightness comparison; r0004's map edits and their visible
  result belong to R4B-11. No model-lighting implementation is added here.
- **Corrections.**
  - Research 75's "marker bits 5-7 (values 2, 3, 4)" are three separate flags: name, occupied+name, action.
  - **H4 §6 "bars cells are type 9 (stored, i.e. walkable in the A* sense)" is wrong.** Soil 9 *trans* is in the
    blocked set 0x701 of every traversable test (`0x510350`, `FUN_0052a090`, `FUN_00511f40`). On MP6 the bars are
    impassable to the planner and the doorway row 10 is the only way through (§4.1).
- **Zone kinds.** H2's ([190](190-h2-hostage-mode-rules-map.md)) kinds 0-6 (`FUN_005d57c0`) play no part in the cost. Only kind 4 ROUTER is used, by plan_addleg
  under app flag 0x20 with the map's router graph. MP maps have only kinds 1 (EXTRACT_ZONE) and 5 (HUD_VISIBLE), so
  zones never change an MP route. The cell height matters only on steep (11) cells: uphill costs 10.0 (BASIC 11.5),
  and smoothing refuses uphill steep steps.
- **MP6** (`out/mp6_flags.txt`):
  - sub-map 0 soils: default 8,278 · nogo 2,124 · noalt 833 · stairs 96 · climb 67 · trans 39 (the bars) · steep 8;
  - static occupied cells: the three hostage starts and `startPlayer`;
  - one action, the DOOR at (102,10);
  - 7 two-way links to the 8 upper/lower sub-maps, two of them into the jail basement ((85,10), (97,23)) and one to
    the jail's upper floor ((96,19));
  - Safety (6,76) 8x15: soil 1 on every stored cell.

---

## 3. How a follower consumes the route

### 3.1 The motion along the points (`FUN_00567900`, D:L429361-429950; AI mode PATH)

- **Target.** The next waypoint is the last stored point P[n−1]; the one after is P[n−2]. When the vector empties,
  the AI drops to mode 1 (idle) with its own cell as the target.
- **Target throttle** `fVar26` starts from ctrl+0x1c4. CAiSFollow sets it each tick through `FUN_00570f90`: H4's 1.2 x
  leader rule.
  - **0** when heading to the final point (unless stance 6) or to a point flagged ACTION;
  - **0.35** when the point is flagged LINK (D:L429556-429566).
- **When a point is consumed** (`FUN_00524d00`, then retarget and recurse in the same frame):
  1. The follower's cell equals the point's cell: GetLocationDelta `FUN_0052c320` = 0, or dx = dz = 0.
  2. The segment test `FUN_00308b00` (previous target → this target) hits, with distance x 0.1 < the point's width
     (byte +4) and the hit parameter ≤ 5.0 (0x6501b0).
  3. The follower has passed the point: distance ≥ 5.0 (0x6501b8), the previous dot product (ctrl+0x60c) > 0 and the
     current one < 0. It also needs GetLocationDelta < 2, or a straight walkable line (`FUN_0052cc80` CanTravelLine)
     to the next point (D:L429700-429715).
- **Action cells.** When the target cell carries an action and is not the last point, the follower dispatches through
  the 8-entry jump table at **0x65c990** (by disassembly at 0x567c40; the decomp lost it):
  - type 1 WINDOW → 0x567ee8 (the vault);
  - type 4 MPBOMB → 0x567ce8;
  - type 7 ITEM → 0x567c60;
  - **type 0 DOOR**, 2, 3, 5, 6 and ≥ 8 → 0x5682c0, the plain steering path.

  So **the path follower does nothing special at MP6's door cell**: it walks through, and the door leaf's collision
  stops it if the door is shut. PROVEN for the table; this agrees with H4 #6's "followers never open doors".
- **Steering.** The heading/speed controller (gains DAT_00650128-0x650138, DAT_0066b0f8, the clamp `FUN_00539b70`)
  was **not transcribed**: PARTIAL; owed below. The port's existing actor locomotion can stand in, since the route
  points are the contract.

### 3.2 Moving between sub-maps

- A route across sub-maps is a sequence of legs whose ends are link cells (§1.2). UpdatePointFlags marks the two
  points around each change LINK, which slows the follower to 0.35 there.
- The body's sub-map changes when `UpdateAiMapLoc` (`FUN_005b7ba0`; `FUN_0052dc70` locates the world position over
  all sub-maps) finds it on the other floor. A link is a stair/door cell where two grids coincide; there is no
  teleport.
- In that update the body also records the leader trail when body+0x105e bit 0 is set.
  - The call is `AddSnakePoint` `FUN_00524d50` (D:L392372 / call D:L471324): the newest cell is inserted at index 0,
    and a loop within the first 5 entries cuts the trail back to it.
  - The width is `GetLocationWidth(..., 5)`, or 0 when the flag is 8. Research 333 corrects the earlier bound:
    the helper returns the first failing ring (1..6); five clear rings return 6 (D:L403994-404092).
  - The trail length is **75** (`FUN_00546c40(.., 1, 0x4b)` at follow start, D:L509301).
  - It also updates the occupancy (§2).

### 3.3 Replan triggers (H4 §4, with the planner side added)

- **Sub 0 plan.** If the follower's cell is inside the leader trail's corridor (`FUN_00524760(trail, F)`: Manhattan
  ≤ some trail point's width; D:L508776), it sets template = trail and app flags |= 0x20 and |= 8. Otherwise
  template = 0 and those flags are cleared (D:L508802-508811).
  - Flag 8 makes **smoothing stay inside the leader's corridor**.
  - Flag 0x20 asks plan_addleg for ROUTER splitting: no-op on MP maps.

  Then `FUN_005623b0(G)` → sub 2.
- **Sub 2.** It waits while the state is INQUEUE, PLANNING or ABORT. COMPLETE with points → re-leg + forced smooth →
  sub 3. Anything else → sub 8 (2.5 s).
- **Sub 3.** The stale/patch/shortcut tests of H4 with 10, 15, 7 and 3. Shortcut = `FUN_0052cc80` CanTravelLine
  F→G and Manhattan + 3 < `GetLength`. The route patch is `FUN_0052bdf0` (ExtendPath).

---

## 4. Validation

### 4.1 MP6, the real AIMAPS (`validate_mp6.py ee` → `out/validate_mp6_ee.txt`; IEEE variant `_ieee.txt`)

The planner is BASIC, bias 1, app flags 3, on sub-map 0 "Base Map" (167x128, 11,445 cells). The goal is the Safety
zone's centre cell (10,83) = (810.26, 1959.72): the "EXTRACTION LOC" mark position of H2.

| route | status | pops / pushes / open left / decrease-key scans | cost | raw cells | raw length | smoothed (x2) |
|---|---|---|---|---|---|---|
| hostageStart (104,5) → (10,83) | COMPLETE | 5,787 / 6,020 / 233 / 341,008 | 3,794 | 146 | 1,686.1 u | 28 pts, **1,658.0 u** |
| hostage2Start (106,4) → (10,83) | COMPLETE | 5,787 / 6,020 / 233 / 341,011 | 3,823 | 147 | 1,704.4 u | 29 pts, 1,676.3 u |
| hostage3Start (106,11) → (10,83) | COMPLETE | 5,787 / 6,020 / 233 / 340,996 | 3,744 | 144 | 1,666.1 u | 26 pts, 1,632.7 u |
| hostageStart → cheapest Safety cell (13,76) | COMPLETE | 5,463 / 5,669 / 206 / 296,917 | 3,705 | 143 | 1,627.1 u | 26 pts, 1,607.2 u |

- **Plausibility.**
  - Every route leaves the cell block by the doorway: raw cells (103,10) → (102,10) → (101,10).
  - It then crosses the guard corridor west and leaves the jail building by its north-west opening (91..92, 4).
  - It runs south along x 89-90 and then south-west across the base to Safety (ASCII map in the output).
  - The bars (x 102-103, z 4-12 except row 10, soil 9) are never crossed.
  - The route is 1.36 x the straight-line distance (122 cells).
- **Rounding.** IEEE rounding gives the identical cell routes with costs 3,850 / 3,881 / 3,800 and ~3% more pops.
  The route shape is robust; the costs and counts are not.
- **Smoothed waypoints**, hostageStart (cells): (104,5) (104,6) (104,9) (103,10) (96,8) (92,4) (91,4) (89,6) (89,19)
  (90,20) (90,29) (91,30) (97,30) (98,31) (98,32) (98,33) (95,36) (75,37) (69,44) (69,45) (58,56) (49,56) (40,67)
  (40,68) (23,82) (17,82) (12,83) (10,83). The kinks at (98,31..33) and (69,44..45) are kept by climb and stairs
  cells, which gate smoothing.
- Online the follower does not plan this whole route at once: it plans to its trail goal near the leader. The test is
  of the planner, not of a rescue.

### 4.2 Console-computed routes in the RDRAM dumps (`rdram_paths.py`, `rdram_validate.py`)

- **What the dumps hold.** No dump is a hostage map. Of the 25, the M51 campaign dumps hold 36 `CSealCtrlAi` each
  (vtable 0x6693f0); several hold a COMPLETE single-leg BASIC route with its stats, waypts and points
  (`out/rdram_paths.txt`).
- **The replay.** `rdram_validate.py` loads **the AI map resident in the dump** (cells, scanlines, actions; runtime
  layout read from the code) and replays each route. It clears the dynamic `m_occupied` marks, which show the
  bodies' *current* cells, not those at plan time (`rdram_occupied.py`). For smoothing it re-marks the planning
  body's own start cell.

| dump | route | console (added, removed, visited, left, length, cost) | replay | points |
|---|---|---|---|---|
| spawn_pcsx2 | (85,168)→(73,151) | 82, 18, 18, 64, 17, 194 | **identical** | match |
| spawn_pcsx2 | (100,231)→(85,219) | 71, 16, 16, 55, 15, 174 | **identical** | tail differs (below) |
| spawn_pcsx2 | (185,281)→(155,286) | 1103, 964, 964, 139, 30, 760 | 1102, 963, 963, 139, 30, **760** | match |
| rest_ours | the same three | -- | 2 identical, 1 one-off as above | 3/3 match |
| s4rand_ours | + (89,168)→(82,162), (211,227)→(221,231) | 40,8,8,32,7,82 · 45,11,11,34,10,108 | **identical** | 5/5 match |

- With IEEE rounding no route matches: costs 186, 206 and 765 (`out/rdram_validate_spawn_pcsx2_ieee_clearocc.txt`).
  **The EE's round-toward-zero is required.**
- The one-node difference on the 30-step route is consistent with a body occupying one frontier cell at plan time:
  the dump cannot show that, and cost and length agree.
- The spawn_pcsx2 tail difference (console (94,226)…(98,230) against the replay's (99,230)) is an equal-cost
  alternative (12 diagonals + 3 straights = 174 either way). Clearing the occupancy or adding the teammate's cell did
  not reproduce it (`out/rdram_route1_*.txt`). Unresolved; it is the only point-list disagreement in 8 routes.
- Grade for the transcription of A* + smoothing: **STRONG → PROVEN by capture** for BASIC on DEFAULT/road terrain.
  Not exercised by any capture: STEALTH, RESTRAINED, steep costs, action cells and multi-leg routes.

---

## 5. Unresolved points and owed evidence

| # | point | what was searched | owed evidence |
|---|---|---|---|
| U1 | How many pops fit in one 33-H-blank slice (when a long plan completes) | budget and timer mode read; M51: 964 pops in 7 slices | MP6 host, lead a hostage from the jail: read the hostage ctrl+0x46c+0x4c stats (ticks, nodes_removed) each frame while state = 2 |
| U2 | The steering controller of `FUN_00567900` (gains, clamps) | read to the dispatch; constants located, not transcribed | a frame-by-frame capture of a following hostage's body +0x1c position and ctrl +0x1c4 throttle, or a further read |
| U3 | Whether remote players' bodies on the host mark occupancy (CRemoteCtrl) | the base ctor sets body+0xe1 bit 4 for every object; UpdateAiMapLoc is the CZSealBody slot | MP6 host: read the m_occupied bit under a remote player's cell (map+0xdc → +0x28 + idx·8) |
| U4 | The spawn_pcsx2 equal-cost tail | §4.2 | none needed for the port: equal cost, unknown occupancy at plan time |
| U5 | Dijkstra details of `FUN_002d1790` (edge factor +8, mask +0x18) | read in part | only for multi-floor follows; a capture of a follow onto Jail House - Upper |
| U6 | The campaign AIMAPS format (the 7th table) | the port's reader refuses M*.ZDB | not needed for MP; M51 fixtures can come from the dump |

---

## 6. First tests the port should write (`packages/scene` or the server's AI module)

1. **The cell word.** Decode soil/occupied/name/action/link/altitude. Fixture: MP6 (102,10) is an action of type DOOR,
   dir 6; (102,5) is soil 9; (104,5) is occupied and named. `traversable` must be false for soils 0, 8, 9, 10 and true
   for 1, 6, 7, 11.
2. **Step costs (EE rounding).** BASIC from default ground: straight 25, diagonal **27**; DEFAULT 10 / **12**. Climb
   75 / 82. The test must fail with IEEE rounding (28 / 13).
3. **The heap.** Build the push/pop sequence of the MSL heap; ties prefer the right child. A three-way tie must pop in
   the same order as `aimap_planner.py`.
4. **Golden routes, MP6** (from `out/validate_mp6_ee.txt`): hostageStart → (10,83): cost 3,794, 5,787 pops, 6,020
   pushes, 233 left, 146 raw cells. The route contains (103,10), (102,10), (101,10) and never a soil-9 cell.
5. **Golden routes, M51.** Five routes from the PCSX2/recomp dumps, with the exact (added, removed, visited, left,
   length, cost) tuples of §4.2. Extract a cell window from `spawn_pcsx2.rdram` as a fixture with `rdram_validate.py`'s
   RamMap.
6. **Smoothing.** The MP6 hostageStart route smooths to the 28 waypoints of §4.1; an occupied start cell keeps the
   first raw point (M51 route (100,231)→(85,219) → [(85,219),(88,222),(93,226),(99,230),(100,231)]).
7. **Failure.** A goal inside the cell block's bars, or one no route reaches, gives FAILED 4. In the follower this
   becomes sub 8, then a replan after 2.5 s (H4).
8. **Occupancy.** Moving a body updates the old and new cells' bit 5. An occupied target costs 2.5 (BASIC 4.0 → 40
   straight).

## 7. Sourced but not implemented (multiplayer-relevant)

- **Adopted in HF, 2026-10-17:** the shared BASIC AI-map planner and cell decoding are implemented (research 333).
  This supersedes the earlier absence of A*; the following gaps remain.
- Dynamic cell occupancy by bodies (bit 5): changes AI costs and smoothing online.
- WINDOW action cells (type 1, direction) on MP1/2/51/71/73/81/82: the AI vaults through them along their axis; the
  path follower's WINDOW handler is 0x567ee8.
- The per-frame planner budget ("ai_route_planner" task, 33 H-blanks) and the 200-slice failure.

## 8. Leads for other workstreams

- **H1/H4 corrections.**
  - The A* is `FUN_00510ff0`; `FUN_00526540` is re-leg + forced smoothing.
  - `FUN_00524760` is the trail-corridor test, not a lateral walkability test.
  - The bars' soil 9 *trans* is impassable (H4 §6).
- **Research 75 §4/§9 "not decoded".** The cell word is now named bit by bit (§2); the second cell word is the A*'s
  f/g. The 40-byte "markers" are CAiMap actions (`direction`, `actionId`, `state`, `type`, `offset`, `type_invalid`
  per the demo DWARF); MP6's is the jail DOOR.
- **The SOCOM 1 demo's DWARF1** holds every AI-map struct (`CAiPath`, `CAiPathStats`, `region`, `action`, `link`,
  `spore`, `scanline`) and the enums (`DIR`, `PATH_TYPE`, `PATH_STATE`, `ACTION_TYPE`): `scratch/H5/demo_dwarf1.py`,
  `demo_all_enums.py`. Other agents can name AI structures with it.
- **The M51 RDRAM dumps** hold live CSealCtrlAi controllers (36 each), useful for any SEAL-AI question (states,
  stances, units).
