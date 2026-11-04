# 333 -- Shared hostage AI-map path planner

HF-PATH, 2026-10-17 UTC. Simulation track. **Reading (independently source-reviewed; HF-PATH PASS, 2026-10-17).** This implements the online BASIC planner
for any supplied `AiMaps`; no map name selects behaviour. Following and body movement are research 334's task.

## 1. Sources re-read

Primary source: `$SOCOM_PC_ROOT/game/analysis/socom2_game.elf.decomp.c` from the desktop handoff export. The source
was read in bounded ranges; none is copied here. Research 200 supplies the prior transcription and independent
MP6 route oracle; research 189, 199 and 206 describe the follower and corrections. The implementation re-read:

| Rule | Original source |
|---|---|
| Eight directions, action-cell exit/entry order, integer g and parent direction | `FUN_00510ff0`, D:L382680-382748; direction table 0x64f910, research 200 §1.2 |
| Blocked soils 0/8/9/10, no diagonal corner restriction | `FUN_00511f40`, `FUN_005121c0`; research 200 §1.2/§2 |
| BASIC bias 1, road/water/climb costs, base occupied/collision/uphill behaviour | `FUN_00512930`, D:L383248-383336; `FUN_00513080`, D:L383455-383519 |
| Heap strict sift-up and right-child tie | `FUN_005132b0`, D:L383531 onward; `FUN_00515270`, research 200 §1.5 |
| 1024 open entries, 24576 closed entries | `FUN_005128f0`, D:L383238-383240 |
| Greedy smoothing, climb/window/bomb/item gates | `FUN_00525810`, D:L392683-392814 |
| Occupied/collision/uphill/corridor/preferred-soil smoothing predicate | `FUN_00525c80`, D:L392827-393012 |
| 0.2-cell line sampling, action endpoint offset | `FUN_00537e50`, D:L403319-403515; `FUN_00516910`, D:L385066-385069 |
| Link graph, zero-cost twin links and one-way direction, DEFAULT path length edges | `FUN_0052a8c0`, D:L395320-395440 |
| Temporary endpoint Manhattan edges | `FUN_0052c5c0`, D:L396440-396485 |
| Polyline length is Euclidean in cells, ignores submap transitions | `FUN_00527e70`, D:L393821-393860 |
| Trail width and flag-8 zero width | `FUN_005396c0`, D:L403994-404092; `FUN_00524d50`, D:L392470-392482 |
| Marker records loaded as 40-byte records | `FUN_0051b820`, D:L387885-387906 |

The scene reader retains marker +8, which supplies offset direction in bits 0..3 and the type-invalid bit 4.
Marker +4 supplies direction in bits 0..3 and action type in bits 23..27. The invalid bit suppresses the outgoing
SATCHEL special case; the following WINDOW/MPBOMB comparisons still read the raw type (D:L382692-382720).

Positive edge-cost operations round to binary32 toward zero, including the final multiplication by 10 before
integer truncation. This holds BASIC default ground at 25 straight/27 diagonal, climb at 75/82, collision at 265,
and uphill steep at 115. Search g/h use signed 16-bit values; the start remains initially unmarked and can be
reinserted once, and closed nodes are not reopened. Maps' cell arrays are never mutated.

## 2. Corrections and API

Research 200 §3.2's width of “≤5” is inaccurate: `FUN_005396c0(...,5)` returns the **first failing ring**, or 6 when
all five rings pass. The source also omits the rightmost top/bottom corner from the horizontal loops and excludes
the last inner row from the vertical loop. These bounds are retained, not replaced with a symmetric square.
`width(loc,flags)` exposes this result for leader trails; flag 8 gives zero. Ordinary follower route points retain
width zero because their app flags 3 do not request width computation (flag 4).

`HostagePathPlanner.plan` returns **start-first** points and integer route cost. `link` marks both sides of a
submap crossing; `action` marks the point before an action cell. It smooths each BASIC leg twice, as the follower's
forced second smooth does. The link graph's DEFAULT paths receive their normal single smooth and are cached once
per planner; temporary endpoints are per request. The constructor takes immutable map data. `point`, `locate`,
`traversable`, `word`, `width` and `canTravel` support the follower. Optional corridor and live-occupancy callbacks
let each route use the current follower context without modifying shared map cells.

`canTravel` is **not** the smoothing predicate: `FUN_005390b0` loses its callback arguments in the decompilation.
The existing capture `$SOCOM_PC_ROOT/logs/parity/spawn_pcsx2.rdram`, instructions at 0x5390bc and 0x5390cc,
loads callback 0x539580 before jumping to `FUN_00537e50`. Instructions 0x539580-0x5396b4 test the blocked-soil
mask and reject an uphill step onto steep soil, but do not reject occupancy or collision soil. `canTravel` uses
that predicate. Smoothing retains its stricter callback. This is source inspection of existing captured code,
not a new runtime measurement.

`extend(points,from,goal,options)` follows `FUN_0052bdf0` (D:L395986-396162): empty/single routes try F-to-G;
otherwise append G when the endpoint-to-G travel line passes. On failure with a corridor template, find the first
newest-first trail point containing each endpoint (Manhattan <= width, `FUN_00524760`, D:L392155-392210), append
the intervening trail cells and goal, then re-leg and force smooth. It returns start-first points or null.

## 3. Verification and limits

Unit tests: blocked bars and the doorway, disconnected destinations, cost rounding, cross-submap links and one-way
links, climb/occupied smoothing, directional window entry, diagonal target-only traversal, and trail width.

Disc-backed tests read `AIMAPS.MPS` and `READERM.ZAR/vehicles.rdr` through the repository readers on **MP6, MP10,
MP11 and MP71**. Every placed escortee has a route to an extraction zone. MP6's three costs exactly match research
200 §4.1: **3794, 3823, 3744**; the first hostage's **all 28 smoothed points** match that note's independent oracle.
The data are read-only local files; no additional game data are committed. This is not a new console capture or
a rendered/browser playtest. These tests establish navigation, not the extraction rules of ESCORT VIP maps.

## 4. Readings and placeholders

| Name | Current behaviour | Evidence to retire it |
|---|---|---|
| `HOSTAGE_PATH_LIMITS_READING` | Original open/closed capacities and 0.2-cell line step | Source review of `FUN_005128f0` and `FUN_00537e50` |
| `HOSTAGE_PATH_SLICE_READING` | `{ slices: 200 }`, carrying the read queue (§6): one FIFO queue per room served head first, the resumable search, 200 slices per leg, the route emptied and the actor standing while pending, cancel on re-request, the link graph built with the planner. Reading, pending review (HOSTAGE-PATH-SLICE, 2026-10-18) | A fresh source review of §6's citations; a PCSX2 or console trace of the queue (CAiPath+0x80/+0x68 per frame) for proven |
| `HOSTAGE_PATH_SLICE_BUDGET_PLACEHOLDER` | `{ expansions: 138 }` a game frame, shared by the room's queue: an expansion count standing in for the original's EE time (33 RCNT0 H-blanks of the frame's 525, `DAT_0064f8d8`, D:L382041-382045, D:L382642-382644), so the room is deterministic; value from research 200 §1.6 (one PCSX2 capture, 964 pops in 7 slices: 138-161 a slice) | An RDRAM/PINE trace of CAiPath+0x68 (slices) and +0x54 (pops) over several routes on MP6, MP10, MP11 and MP71 |
| `HOSTAGE_PATH_SCHEDULING_PLACEHOLDER` (retired 2026-10-18) | was: "Synchronous request, bounded by original open/closed capacities; no shared RCNT0 33-tick slices or 200-slice timeout"; replaced by `HOSTAGE_PATH_SLICE_READING` and `HOSTAGE_PATH_SLICE_BUDGET_PLACEHOLDER` (§6) | retired |

The former `HOSTAGE_PATH_LOCATE_PLACEHOLDER` is retired: research 335 §2 transcribes the original raw-cell and
layered-height selection, independently source-reviewed on 2026-10-17. A stored blocked cell is a valid raw
location; navigation separately retains its last walkable cell. This supersedes the earlier nearest-traversable
altitude approximation. Original running multi-floor comparison remains unmeasured.

`HOSTAGE_PATH_LIMITS_READING` names original list capacities and the line-walk increment. Generic line geometry
uses JavaScript arithmetic; exact EE geometry boundary rounding has not been measured. No claim of full motion
parity follows from the exact MP6 route. Live dynamic occupancy must be supplied by the caller; absent it, the
file's occupied bits still participate. Doors are not opened by this planner; physical collisions belong to motion.

## 5. Fresh-review corrections and retained test evidence

The review found two original mismatches, corrected with failing regressions first:

- Diagonal action offsets use `FUN_00519130` (D:L386475-386532), whose diagonal axes are
  `DAT_0065ab38 = 0.7071067690849304`. The existing `logs/parity/spawn_pcsx2.rdram` float at 0x65ab38 gives that
  value; 0x65b030 gives the endpoint scale 0.75. A blocked cell beside the line from an NW-offset action at (2,2)
  to (1,7) distinguishes normalized axes from the erroneous +/-1 axes.
- The link search uses float additions (`FUN_002d1790`, D:L173917), inserts newly discovered equal-cost entries
  **before** existing equals (D:L173932), and chooses the first strict minimum (D:L173858-173878). Decreasing an
  already-discovered entry leaves it in list position. A symmetric two-link graph distinguishes the resulting
  second-discovered exit from the erroneous lowest-index exit. Distance additions now use EE binary32 truncation.

Initial RED excerpt retained from the implementation tool output (no separate raw log was saved for that run):

```text
FAIL test/hostagePath.test.ts [ test/hostagePath.test.ts ]
Error: Cannot find module '../src/hostagePath'
Test Files 1 failed (1)
Tests no tests
```

Review regressions' RED output excerpts (the complete untracked logs were saved under the host's temporary directory):

```text
uses original normalized diagonal action offsets when a travel line grazes a blocked cell
AssertionError: expected false to be true
Test Files 1 failed (1)
Tests 1 failed | 12 skipped (13)

takes the newly discovered equal-cost graph node first, as the original link search does
AssertionError: expected [ 1, 1 ] to deeply equal [ 5, 5 ]
Test Files 1 failed (1)
Tests 1 failed | 13 skipped (14)
```

Those skipped counts are tests filtered out by the targeted `-t` selection, not passes or missing-data runs.

GREEN after both corrections, with all four local extraction-map archives available:

```text
✓ test/hostagePath.test.ts (14 tests) 768ms
Test Files 1 passed (1)
Tests 14 passed (14)
```

## 6. The search's scheduling (HOSTAGE-PATH-SLICE, issue #308, 2026-10-18)

Reading, pending review. PR #279's fresh review (F1) found the synchronous `plan()` inside the room's tick: up to
~68 ms for a failed plan on MP71, retried every 2.5 s. The original slices the search. Re-read for this task:

- **The queue task.** `FUN_00510570` (D:L382029) is the per-frame "ai_route_planner" task (priority 10.5, D:L50931;
  the unit tick driver `FUN_005e7fd0` is at 0.8, D:L50920, and `FUN_0034e6b0` keeps the task list ascending,
  D:L248838 -- the runner's walk itself is not read). It stops when the queue is empty or when
  `RCNT0 - start >= DAT_0064f8d8` (D:L382041-382045). `DAT_0064f8d8` is 33 in the ELF's `.data` (re-read for this
  task); RCNT0's mode 0x83 (D:L249334) counts H-blanks, 525 a game frame (research 185). The budget is EE time; no
  expansion count can be read from the code: `HOSTAGE_PATH_SLICE_BUDGET_PLACEHOLDER`.
- **Head first.** The task always serves the queue's head path (D:L382048): INQUEUE gets its planner (D:L382059),
  PLANNING resumes (D:L382065); out of time the search returns code 5 and stays PLANNING (`FUN_00510ff0`,
  D:L382642-382644, D:L382786), its lists global, so one search is in flight. A finished leg deletes its planner
  (D:L382067); `plan_complete` `FUN_005273c0` queues the next leg or finalises (D:L382077-382081, D:L393419-393440),
  and the next path starts in the same frame while budget remains. Commit `FUN_005109d0` inserts by priority
  (D:L382265-382288); the follower's priority is 0 (`FUN_00528340` D:L394040), preemption needs `DAT_0065aed8` = 1.0
  (D:L382280, `.data`), so hostage requests are first come, first served. Legs run last first (+0x2c = legcount-1,
  D:L382298; decremented D:L393431); `FUN_005274b0`'s storage order is not re-read.
- **200 slices.** Each call of `FUN_00510ff0` counts a slice (CAiPath+0x68, D:L382611); after a pop that is not the
  goal, 200 fails the leg (code 2, D:L382674-382685); the count is cleared per leg (D:L393433-393436).
- **The waiting actor.** Follower sub 0 cancels its request (`FUN_005107b0`, D:L508814) and requests
  (`FUN_005623b0`, D:L508815), which refuses an untraversable goal (D:L426856), empties the controller path
  (`FUN_00527310`, D:L426860, D:L393385-393410) and registers (D:L426868). Sub 2 waits while the path's state is 1-3
  (D:L508825): no route, the actor stands. Failure (no points or state other than 4) waits 2.5 s in sub 8
  (D:L508828-508829). Recovery phase 5 registers (D:L512917-512944), phase 6 waits likewise (D:L512950) and a failed
  search ends recovery (D:L512951); the saved pair's single-point fallback is taken only when registration refuses
  (D:L512917-512926). The port's former fallback after a failed search is ended (`recoveryRequest`).
- **The link graph.** CreateGraph `FUN_0052a8c0` (D:L395320) runs at map setup through the unbudgeted
  `FUN_00510390` (D:L381967-381989, call D:L395416); the link route of a request is synchronous at registration
  (D:L396501). The planner now builds it in its constructor.

The port (`hostagePath.ts`): `request(stops)` registers synchronously (a refusal is null) and queues a ticket; the
room's authority calls `slice()` once a game frame after the hostages' frame, with the shared expansion budget. A
planner made without a budget (tests, the recording harness) answers each request at once, as `FUN_00510390` does;
`plan()` is that immediate path. The follower (`hostageFollow.ts`) empties its route at the request and stands in
sub 2 while the ticket is pending; recovery phase 6 waits on its own ticket.

**F2, the trail.** `FUN_005b7ba0` locates the leader's raw cell (D:L471278); a cell failing `FUN_0052a090`
(D:L471291; soil mask 0x701, D:L394982-395007, the port's `traversable`) adds nothing to the trail (D:L471294-471306);
a navigable changed cell is stored (D:L471318) and added (`FUN_00524d50`, D:L471324). The room adds a trail point only
on a traversable cell; the heading update stays unconditional.

**Observed, not built.**
- The forced add of body+0x1061 bit 6 (D:L471309, with width flag 8, D:L471320-471322): its meaning is unread.
- Code 6 then 5: when the open list fills (code 6, D:L382749-382750) and the frame's time ends at the next loop top,
  code 5 overwrites it (D:L382780-382786); the search resumes next frame with a full list (cVar18 cleared,
  D:L382637). The port fails at once.
- The port cancels a stopped follower's queued request; the original's stop path is not read.

Evidence kinds: source inspection (this section) and unit and dev-disc tests (`hostagePath.test.ts`,
`hostageFollow.test.ts`, `hostageRecovery.test.ts`, `hostagePathSlice.test.ts`); no capture and no rendered run.

**Outside the expansion budget (HOSTAGE-PATH-SLICE's review F2, 2026-10-18).** Two pieces of a plan's work are not counted
against `HOSTAGE_PATH_SLICE_BUDGET_PLACEHOLDER`: the two `smooth()` passes when a search finishes (`packages/match/src/hostagePath.ts`
~:451-452; measured 0.22-0.72 ms on the longest escortee routes), and `linkRoute`'s Dijkstra over the link graph at registration
(~:492, a cross-submap request, inside the hostage's frame). As in the original, the smoothing sits outside the planner's pop
count; neither is asserted by the stall test (which bounds expansions per frame). Several short requests finishing in one frame
after a long head fails each smooth twice. Owed if a frame breaches the bar: a wall-time or call-count note, or slicing them (a
further adaptation). The review's probe saw no step without a GC pause over 0.34 ms.
