# 335 — Hostage occupancy and location

HF-OCCUPANCY, simulation track. **Reading** for location, occupancy and correction math (independent source review
PASS, 2026-10-17); vehicle-definition audit below independently reviewed PASS (high), same date. Source is the original game ELF decompilation;
`D:L` means `socom2_game.elf.decomp.c`. No original running comparison is claimed.

## 1. Two different occupied-cell costs

`FUN_00512930` D:L383301-383327 checks cell bit32, then membership in the registered object-footprint list through
`FUN_00515750`. A matching mask returns base50; ordinary actor occupancy returns base2.5. The existing callback
incorrectly gave every occupied actor cell base50. BASIC adds its existing soil bias afterward. Membership without
bit32 is insufficient. Uphill steep precedence remains unchanged. `canTravel` remains the distinct permissive
travel predicate; smoothing refuses occupied cells.

`FUN_00515750` D:L384503-384528 matches map, bounding rectangle and the row's half-open x span. It does not invent
an actor radius. The only direct list-registration caller found is `FUN_003adab0` D:L303212-303286, constructing
scene-object bounds, not character avoidance. Its class constructor is `FUN_003ade90` D:L303307-303330 (type4).

## 2. Raw location is not walkability

`FUN_0052dc70` D:L397225-397428 returns the first stored row cell even if its soil is blocked. Map0 cell bit21
activates layered-map selection. In that case soil10 is skipped; a first walkable cell within inclusive ±0.5 of
feet height wins immediately. Otherwise later stored cells with height delta strictly greater than -10 compete
by absolute delta, including ties; a walkable candidate replacing a blocked candidate gets 0.5 extra tolerance.
Map iteration order is retained. There is no preferred-map tie override in this source.

The constants are independently read from `logs/parity/spawn_pcsx2.rdram`: float at `0x64f958` is -10,
`0x64f960` is 0.5, and `0x64f968/970/978` are zero. `FUN_0052eb60` D:L397713-397721 is the inclusive range helper.
`HOSTAGE_LOCATION_READING` records bit21 and these two thresholds; no new placeholder is used for this selection.
The old `HOSTAGE_PATH_LOCATE_PLACEHOLDER` is retired by this transcription. Coordinate conversion continues through
the repository's `aiCellOf` reader; this does not claim instruction-level floating-point parity.

`FUN_005b7ba0` D:L471278-471318 stores the raw cell separately from the last navigable cell. A blocked raw cell must
not erase the latter: the steering task owns this follower-state part. This distinction explains the physical
four-map regressions where collision correction put the feet in a stored but blocked soil cell.

## 3. Verification

Unit transcription tests distinguish actor base2.5, footprint base50, unoccupied mask membership, and layered
location including blocked first cells, bit21, inclusive height tolerance, strict -10 exclusion and soil10 skip.
The shared planner's disc-backed tests cover all hostage starts on MP6, MP10, MP11 and MP71. These are unit/dev-disc
checks, not rendered playtests or comparisons against the original running.

## 4. Runtime actor cells and AI-map correction

`HostageObstacles` owns a room-private bit32 overlay. `FUN_00529a90` D:L394775-394796 clears the old cell unless a
registered object footprint covers it, then sets the new cell. It neither excludes the actor itself nor counts
other actors in that cell. `FUN_005b7ba0` D:L471284-471327 compares x/z (not map bits) before updating. The port keeps
those semantics rather than inventing a collision radius, self exclusion or reference counts. Live room players
and hostages stamp their last navigable cell; blocked raw cells retain it. Departed/inactive actors remove their
stamp and round reset clears room-owned state. `FUN_0029ee10` D:L145030 initializes active bit4; `FUN_0029e8b0`
D:L144775 clears it, and `FUN_00547af0` D:L413029 releases the old cell. The existing room lifecycle supplies these
active/removal events; exact corpse-frame timing still needs an original multi-actor trace.

The planner consumes the override for BASIC cost and smoothing; its immutable link graph remains authored-only.
An explicit footprint interface retains source row spans and preserves object coverage when an actor leaves.
Replacing an object footprint clears its old mask and stamps its new one (`FUN_00515880` D:L384539-384541).

`FUN_00516f10` D:L385275-385280 selects the raw cell's submap, then `FUN_005169b0` D:L385139-385260 computes the
AI-map correction separately from physical hull collision. A link cell (bit256) bypasses it. The proposed position
relative to the cell's center (including action-marker offset) selects two cardinal neighbors in quadrant order.
Only stored cells of soil0/8/9/10 contribute. Each forward-facing blocked neighbor contributes its direction times
`half cellSizeX - (dot + radius)` when negative. The correction sum is capped in the actor caller
`FUN_005483d0` D:L413925-413938. Radius and cap are both5, captured floats at `DAT_0064fd18/20` in
`logs/parity/spawn_pcsx2.rdram`, recorded as `HOSTAGE_AI_COLLISION_READING`.

The decompiler drops the scalar passed to vector scale. Instructions at `0x00516e2c` and `0x00516e30` in the same RAM
capture add radius to the dot and subtract that result from half-cell into f12; the call at `0x00516e40` scales the
direction using f12. No decompiled code is reproduced. `correctMotion` returns the corrected proposed feet; the
steering task owns the controller/invalid-navigation gate and application to movement.

## 5. Remaining footprint binding

`HOSTAGE_DYNAMIC_FOOTPRINT_PLACEHOLDER` names the unported vehicle producer. `FUN_003ade90` D:L303307 constructs
type4 and `FUN_003adab0` D:L303212-303286 selects a named collision node and registers its mask. The port's SimMap
has door polygons and swing bounds, but no corresponding type4 mover identity and named footprint quad. Treating
a door's entire swing box, a physical hull, or an actor radius as that mask would invent navigation behavior.
`FUN_00515900` D:L384573-384696 computes/clamps quad bounds; `FUN_00516180` D:L384881-385033 scans cell centers into
row spans. This producer and its live transform/update binding are still owed. The API's row-mask tests do not
claim that real map scene objects are now supplying footprints. An original multi-actor/object capture is needed
to verify lifecycle ordering.

The producer's identity is now read: `FUN_003ae240` D:L303403-303468 reads the `VEHICLE` table; its caller at
D:L152670 names `ai_vehicles.rdr` and `data/common/zrdr`. Strings were independently decoded from the supplied RAM
at `0x3fc158`, `0x3f1b80` and `0x3f1b60`; the field at `0x3fc188` is `COLLISION_BBOX`.
`RUN/READERC.ZAR/ai_vehicles.rdr` contains exactly two definitions: `tank1` with `t72tankdi`, and `drugplane` with
`planedi_invis`. `hostageVehicleAudit.test.ts` reads the complete definition table and every node/model name in
each map's parsed `*_GEO.ZED`, including unplaced model roots. None of these four names occurs on MP6, MP10, MP11
or MP71. The separate placed-instance inspection found zero matches among 1271, 358, 374 and 615 instances,
respectively. Thus these authored maps have no configured vehicle footprint producer; this does not establish
that doors or other hulls should receive invented masks, or that the producer is implemented for other maps.

## 6. Readings and placeholders

| Name | Status | Meaning |
|---|---|---|
| `HOSTAGE_LOCATION_READING` | reading | Original raw cell and layered-height selection, §2; independently source-reviewed. |
| `HOSTAGE_AI_COLLISION_READING` | reading | Radius and correction cap, §4; independently source-reviewed. Activation remains the steering controller's responsibility. |
| `HOSTAGE_DYNAMIC_FOOTPRINT_PLACEHOLDER` | placeholder | Vehicle row-mask generation/live transform binding, §5; API exists, producer is not implemented. The four hostage maps contain neither configured vehicle. |

## 7. Persistent collision-soil marking and contact output

`FUN_00556370` D:L420719-420720 handles persistent hull contact by marking a command-direction neighbor of the raw
cell and then the recorded contact cell through `FUN_00556ee0` D:L420925-421002. A stored contact cell becomes
soil13 only when it is not a link (bit256) and its soil is1,2,4,5,12 or13. The directional call does not mark the raw
cell itself; it selects a neighboring traversable cell and recursively applies that eligibility test. A link raw
cell does not prevent marking a neighboring non-link cell. Other cell bits are preserved. There is no expiry in
these functions. The browser stores these changes per room and clears them on round reset, keeping shared disc
cells immutable. BASIC search and smoothing read the overlay, so the marks affect subsequent recovery routes.

Direction quantization follows `FUN_00518b60` D:L386241-386308: choose the northern or southern hemisphere by the
north-direction dot sign, scan five directions in its original order, and keep only strict score improvements.
Equal scores retain the first direction; a zero vector retains west. Diagonal axes use research333's captured
normalized value. This does not introduce an atan2 rounding rule or choose direction by collision normals.

`correctMotionWithContact` exposes `FUN_005169b0`'s output parameter7: the first neighbor contributing a correction
(D:L385246-385248). The motion-only API delegates to it. The consumer can therefore register the actual blocked
AI cell without guessing from feet or velocity loss. Event accumulation and state16 recovery are the steering
task's responsibility; this API alone does not claim that recovery is complete.

Tests cover all32 soil values, link exemption, raw-link neighbor marking, room isolation, unchanged source cells,
round clear, subsequent path cost/smoothing and first-contact quadrant order. These are transcription checks;
original runtime comparison remains owed.

## 7. Distant blocked-cell recovery rays

Reading, independently source-reviewed. `FUN_00535730` D:L402127-402203 returns eight endpoints in the
`DAT_0064f910` compass order (north, northeast, east, southeast, south, southwest, west, northwest).
The recovery caller's `DAT_00651000` is integer10 in `spawn_pcsx2.rdram`; the direction table was checked there too.
A traversable input returns eight unchanged cells with distance0. Otherwise each ray advances through stored
soil0,8,9,10 cells, including the first traversable cell in its distance, and stops after ten cells.
Missing row storage or map bounds stops without advancing the endpoint. For nonzero submaps, this sets distance10;
map0 retains its actual distance. The tested `sub+0xe4` is the submap index, not a new obstacle flag:
`FUN_005120a0` D:L382924-382927 returns it as the location map index, and loader D:L395621 assigns it.
`FUN_00511f40` D:L382865-382874 defines the blocked soil set. A missing endpoint height is returned as null,
allowing the recovery consumer to preserve its original failed-lookup handling without an invented elevation.

`recoveryRays` only supplies the source endpoints. Candidate selection and recovery mode changes remain in the
steering controller. Tests cover direction, first traversable inclusion, ten-step exhaustion, traversable input,
bounds, sparse rows, missing height and map0 versus nonzero-map stopping. These are transcription unit tests;
the four disc-backed planner tests also pass, without claiming a console comparison or physical traversal pass.

## 8. Forward-probe ray visitor

Reading, independently source-reviewed. `routeProbeCells` transcribes `FUN_00537e50` D:L403379-403635 without its caller's
collision policy. `FUN_0056a130` D:L430346 passes float bits0x3e4ccccd, so samples advance by that fraction
of cellSizeX, divided by XZ endpoint distance. Both endpoints require stored cells; authored action offsets use
normalized directions times0.75 (`DAT_0065b030`, captured RAM). XZ direction is normalized, while directionY
retains the endpoint height difference. Samples interpolate from t0, suppress repeated X/Z cells, and invoke
the callback with current and previous runtime words, traveled distance and fraction. Callbackfalse stops immediately.
EE float operations use signed round-toward-zero through the existing arithmetic helper.

The final exact endpoint is processed separately. Missing interior storage returnsfalse, whereas missing final
storage returns the prior successful callback result (interior D:L403589-403604; final D:L403502-403519). This asymmetry
is intentional and tested with an action offset landing exactly on a sparse-row boundary. The start sentinel is
0xffffffff (`DAT_0065aed0`, captured RAM), ensuring an ordinary first cell is visited. Same-cell endpoints visit once.
Runtime words include room occupancy and collision soil; no canTravel obstacle gates are applied. Steering owns
the `FUN_0056a2e0` callback and event consumption; this iterator alone does not claim forward avoidance is complete.

The action-offset addition rounds the cell center first, matching D:L403382-403401's separate vector addition.
A regression uses a non-exact center and diagonal offset to distinguish the two EE results.
