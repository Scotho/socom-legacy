# 334 — Shared hostage follower motion

HF-FOLLOW, simulation track, 2026-10-17. **Reading (independently source-reviewed, 2026-10-17)** for the transcribed rules below;
Steering, persistent recovery, forward probes, AI hull and contact-climb/hang behavior have independent source review PASS (climb: 24913fe9). Automated physical and rendered evidence is recorded in the HF plan. No original runtime comparison or human playtest was run.
Research 189, 199, 200 and 206 supplied pointers; the listed ranges of `socom2_game.elf.decomp.c` were re-read.

## 1. Follow state and leader trail

`FUN_005fb1c0` (D:L508575-509081) checks the leader, then stays in its initial stance phase until the leader's
trail length reaches eight cells (D:L508635-508652). Length is Euclidean per adjacent same-submap pair,
not a point count or Manhattan length (`FUN_00527e70`, D:L393821-393860). The initial phase mirrors stance;
afterwards an escortee asks stand (`FUN_005fc590`, D:L509156-509211). The existing AI owns the stance delay.

`FUN_005fc970` (D:L509297-509347) starts a 75-cell leader trail, uses body-facing heading normally, and switches
to the velocity heading after speed squared exceeds 800, heading dot velocity exceeds 0.82, and accumulated
integer frame milliseconds exceed 2000. `FUN_00524d50` (D:L392372-392496) inserts newest first and removes loops
found through inclusive index five (six entries; D:L392414-392423 compares x/z without the map bits).
`logs/parity/spawn_pcsx2.rdram` at 0x650928 holds integer 5; `FUN_005b7ba0` D:L471324 supplies that bound.
This corrects research 200's loose wording "first 5 entries". Width comes from research 333's planner reader; see that note's correction
to research 200's width bound. Trails belong to each room and leader and are discarded when no follower remains.

`FUN_005fd790` (D:L509786-509897) selects the formation-depth trail point and walks the signed lateral offset
within the trail corridor while each new cell is walkable. This is a **candidate-only** soil check
(`FUN_005fd790` D:L509862-509875 calls `FUN_0052a090`, D:L394984-395016): missing cells and soils 0,8,9,10
(mask 0x701) are refused. It does not apply CanTravelLine's uphill-onto-soil11 refusal. The uphill-soil11 regression
holds this distinction and refuses the subsequent soil9 candidate. If no point exists, `FUN_005fb1c0` D:L508700-508715
uses leader position minus 0.65 velocity plus the rotated slot offset. The original cell scale is ten world units.
Formation 1's eight slots are (2,2), (3,-2), (4,-3), (5,-2), (6,3), (7,5), (8,-4), (9,-5), read in
`FUN_005eb910` (D:L500124-500166). Individual FOLLOW assigns slot **zero**, explicitly, through
`FUN_005fd050` at D:L450398-450399, so the room does not invent a slot from spawn or recruitment order.

State transitions (`FUN_005fb1c0`, D:L508802-509081): 0 requests a route and enters 2, or enters 4 when arrived;
2 enters 3 on a nonempty completed route, otherwise 8; 8 waits 2.5 seconds then returns to 0.
3 tests shortcut and stale route, then throttle. Staleness uses end distance <=10 or moved goal distance >=15;
failed extension replans within seven cells. The shortcut compares Manhattan to goal +3 against Euclidean route
length **truncated to an integer** (`FUN_005fb1c0` D:L508918 casts GetLength's float result before comparing).
The fractional-route regression pins 5+3 < trunc(sqrt(10)+5) as false, preventing a repeated replan without movement.
The stale-route/end-distance predicates extract x/z only (D:L508840-508895, D:L508924-508937), as does idle restart
(`FUN_005fc7d0` D:L509239-509258). Different map IDs alone therefore do not create a distance or stale route.
The shortcut retains its explicit same-map gate (D:L508898); corridor and planner map gates remain separate.
Arrival is within 1.25 × radius 15; 3 enters 4 when arrived and either at route-end cell or leader speed
<10. State 4 remembers the leader cell, enters 7; 7 restarts after the leader moves more than one cell and the
follower is no longer arrived. The rear probe, turning state 5, and WAIT_UP/600-unit hold require a host-local
human controller. The dedicated room has remote players, so these branches are not synthesized for one seat.

## 2. Throttle, physical body and lifecycle

`FUN_005fb1c0` D:L508938-508948 uses throttle 1 outside 4.5 × radius 15. Inside, it clamps
1.2 × leader speed / **leader top speed** between min(leader controller cap,0.25) and 1. Human controller cap is
1; the room lends the actual stance's forward band from its shared mover. The existing `HOSTAGE_TOP_SPEED_READING`
supplies the hostage forward top, 65 units/s
(No_weapon anim set, research 199 §3 and §12.4; `FUN_00592880` / `FUN_00592910`, D:L451736-451773).
No fallback silently substitutes hostage speed for a missing leader speed table: legacy watch-only test bodies
without navigation fields do not move. LINK points use 0.35 (`FUN_00567900`, D:L429556-429566).

The shared `Walker` ground collision uses the room's grid, including the same live door-leaf polygons as players.
No position is copied from an AI waypoint: horizontal displacement passes through hull collision and floor
selection. Coincident link points are consumed without changing world position or height. An airborne
body uses the shared mover's fall independently of AI-location lookup, planning, idle or failure waits
(`FUN_0059b440` D:L456496-456512; `FUN_005af930` D:L466797-466803). HOLD or rescue stops navigation but
does not cancel existing fall momentum; the live physical body continues falling. Followers never activate doors
(`FUN_00567900` action dispatch, research 200 §3.1).
Actual displacement per game frame supplies snapshot vx/vy/vz, so existing civilian speed animation can read it.

Follow end/suspension, HOLD, leader release, rescue and death stop movement and clear the route. Reset constructs
new movers and clears trails; seat takeover rekeys both trail and mover leader without resetting progress.
Extraction admission stays game-type 4 plus authored escortee starts, shared across MP6, MP10, MP11 and MP71.
Escort (game type 3: MP52 The Mixer, MP53 Foxhunt, MP82 Guidance, research 192 §1) uses the same escortee starts and
the same follower. Until 2026-10-18 the room built no authority for those maps, so Foxhunt opened with no VIPs. It
now does. Scoring is research 175 §4, not Extraction's chain, on each map's script (`ESCORT_ZONES_READING`,
`ESCORT_COUNTDOWN_READING`; reading, pending review). RescueN latches a VIP in Safety or Safety2 (Guidance: Safety
only); SEALcheck waits 30 s (20 s on Guidance) and then promotes **both** Safety and Safety2 to kind 1 on all three
maps, unconditionally. The IF / ELSEIF before the promotions only chooses the helicopter's animation by which zone holds
a VIP (MP52 @5468 `chopper_rescue2`, @5596 `chopper_rescue1`); the promotions after it (MP52 @5656/@5676, MP53
@5688/@5708, MP82 @5196/@5216) run whichever branch was taken. (Until PR #331's review this note said the latched zones
alone promoted: wrong.) EndRescue1-3 then extract a living VIP in Safety OR Safety2 on The Mixer and Foxhunt (MP52
@4400, MP53 @4432) and in Safety only on Guidance (@4224), though Guidance promoted both. `INREGION` is positional
(`FUN_005ced60` D:L484773-484944): the cell's sub-map and the rectangle, never the zone's kind. One living VIP
extracted wins for the SEALs; three VIP kills win for the Terrorists. The helicopter's animation is not played.
A game-type-3 map that is none of the three plays The Mixer's and Foxhunt's shape (`ESCORT_UNREAD_MAP_PLACEHOLDER`).
A forge layout never reaches it (FG-51, PR #351, 2026-10-22; reading, pending review): `forge/objectives.ts`
`forgeTypeUnplayable` lets a layout name ESCORT only on a map whose own script is read (`ESCORT_ZONES_READING`,
`ESCORT_COUNTDOWN_READING`, the room's `escortScriptOf`) and that has escortees; on an Extraction base (MP6, MP10, MP11,
MP71 -- `Safety` there is kind 1 from the start, research 175 §5.1-5.4, so the generic rescue would come before any
staging) the base's own type plays.
EndRescue raises `truecount` and stops `start` before its WAIT 2 (MP52 @4528, MP53 @4560, MP82 @4300): from an
extraction on, neither an elimination nor `killcount >= 3` awards the round (`ExtractionAuthority.startStopped`).
Owed (LATER 125, PR #331's review F4): the page's end-of-round lines on the escort maps ("A VIP HAS BEEN EXTRACTED",
"THE TERRORISTS FAILED TO ELIMINATE THE VIPS.", "SEALS VICTORIOUS!", "THE VIPS HAVE BEEN ELIMINATED.") are not drawn
from the escort scripts yet.

## 3. Readings and placeholders

| Constant | Kind | What it means; evidence to settle it |
|---|---|---|
| `FOLLOW_RULES_READING` | reading | Numeric rules in §1–§2, re-read from the named functions and research 199's verified tables; independent source review PASS (HF-FOLLOW and combined review, 2026-10-17). |
| `FOLLOW_SLOTS_READING` | reading | Formation 1 table in §1; independent source review PASS (HF-FOLLOW and combined review, 2026-10-17). |
| `HOSTAGE_STEERING_READING` | reading; independently source-reviewed | Normal calm-alert heading cap, forward braking, command slew, lateral perturbation and point passage transcribed in §5; targeted unit tests, no runtime comparison. |
| `HOSTAGE_AVOIDANCE_READING` | reading, independently source-reviewed | Persistent hull/AI obstacle records and traversable-cell recovery in section6; HF-SPECIAL lifecycle/reentry additions below are independently source-reviewed readings. Unit-transcribed, no original runtime comparison. |
| `AI_HULL_READING` | reading, independently source-reviewed | Grounded AI centerline reach and retained-normal threshold, section9; synthetic hinge/wall/material tests. |
| `HOSTAGE_CLIMB_READING` | reading; independently source-reviewed | Six prerequisite motion types and NoTurn clip membership; contact-climb section below. |
| `ESCORT_COUNTDOWN_READING` | reading, pending review | SEALcheck's WAIT on each ESCORT map: 30 s on MP52 (@5644, @6060) and MP53 (@5676, @6092), 20 s on MP82 (@5184, @5472); `objectives` read with `tools/probe-npc-maps.ts --section commands`. Settles: a fresh reviewer's re-read of the three scripts; a capture of the countdown on one map. |
| `ESCORT_ZONES_READING` | reading, pending review | The zones by name each step tests (§2): stage MP52 @3764 / MP53 @3796 Safety or Safety2, MP82 @3696 Safety; promote both on all three (MP52 @5656/@5676, MP53 @5688/@5708, MP82 @5196/@5216); extract MP52 @4400 / MP53 @4432 Safety or Safety2, MP82 @4224 Safety. The script names each zone by its corner's location word; `escort.test.ts` holds on the disc that the named zones sit there. Settles: a reviewer's re-read; a capture of a Guidance VIP in Safety2 after the wait. |
| `ESCORT_RESCUE_HOLD_READING` | reading, pending review | 28 s from an extraction's decision to the round's end state on a SEAL host (the room's console, `ELIMINATION_PERSPECTIVE_READING`): `hostages_rescued` sets `mp_winner = 0` (MP52 @6348), `escort_success` WAIT 2 (@7208) and WAIT 5 (@7268), then `success`'s WAIT 20 and WAIT 1 (@7436, @7472); MP53 @7240/@7300, MP82 @6620/@6680. Was 21 (success alone) until PR #331's review. Settles: a capture of an escort extraction's round end on a SEAL host. |
| `ESCORT_KILLS_HOLD_READING` | reading, pending review | 21 s after the third VIP kill: `start`'s `killcount >= 3` branch calls `success` itself (MP52 @2192, MP53 @2224, MP82 @2140), WAIT 20 and WAIT 1. Settles: a capture. |
| `ESCORT_UNREAD_MAP_PLACEHOLDER` | placeholder | The script of a game-type-3 map that is none of MP52, MP53, MP82 (a test's; never a forge layout's since FG-51, which names ESCORT only where this is not the script, as above): The Mixer's and Foxhunt's shape, 30 s and Safety / Safety2 throughout; and Foxhunt's kill stops (LATER 131, `ESCORT_KILLS_STOPPED_READING`: the Terrorists' elimination win and the time-out, never a SEAL win), where the page reads that map's own `stopsKills`, so the room and the page can differ there. Not a game value. Settles: that map's own `objectives`, read. |
| `FOLLOW_STEERING_PLACEHOLDER` | placeholder | Special aim/strafe and alert-mode changes, actor-contact suppression, special action-marker controllers and ladder reservations remain outside the normal route transcription. Resolve original state transitions and compare framewise original motion before claiming complete parity. |

Formation 2 and the leader
heading-lock flag are not currently exposed by the room; ordinary online individual FOLLOW uses its default
formation 1. The planner's own limitations are research 333's. This is a functional, collision-bound follower,
not a claim that original steering or every traversal animation has been reproduced.

## 4. Verification

`packages/central/test/hostageFollow.test.ts`: trail capacity/loop removal, initial trail delay, leader-denominator
throttle, movement and velocity reset, retry timing and a falling body outside AI-map coverage; the MP6 fixture's real jail door blocks the follower while
closed and allows passage when opened. `extractionFollow.test.ts`: all four maps' binding and separation from
VIP scoring, HOLD/release/death/rescue velocity stopping, round reset and takeover. Fixture-backed tests skip
when fixtures are absent; a skip is not a pass. The four-map tests establish binding/lifecycle, not physical traversal
of all four maps. Unit and dev-disc evidence are separate from browser/capture proof.

## 5. Normal route steering (HF-STEER, independently source-reviewed)

The constructor `FUN_00574080` (D:L435149-435179) selects vtable 0x6693f0 and initializes alert to zero.
The spawn RAM vtable slot +0x9c (0x66948c) selects `FUN_0056c340` (D:L431368-431421), not the local
player's simpler turn helper. Its calm-alert turn cap is 2 times (0.35 times (1-throttle) plus throttle).
The dot threshold is 0.9396899938583374; above it, the signed planar cross times 1.25 is clamped to that cap;
otherwise the cap takes the cross's sign (zero chooses positive). Values are RAM 0x64fd98, 0x650100,
0x650108, 0x650118 and 0x650120. Higher-alert and special aim/strafe states remain the named steering gap.
The direction convention is forward (-sin(yaw), -cos(yaw)); positive turn is left. The body consumes the turn
axis through `FUN_00550ef0` D:L418340, times the existing shared turnMaxRate (research 83).

`FUN_00567900` D:L429551-429566 requests zero throttle for the final point in ordinary route mode3 or a
halt/action point; links request 0.35, otherwise FOLLOW's throttle. D:L429851-429874 permits forward input
when distance exceeds 30 or facing dot is at least 0.8659999966621399 (excluding actor subtype4). Zero requested
throttle uses proportional distance gain 15.753800392150879 and previous-forward damping64; a nonzero request
approaches it with gain8. Both clamp to FOLLOW's throttle. A negative heading dot further clamps to +/-0.25
(the spawn's 0x66b200 is zero). Constants: RAM 0x650130, 0x650134, 0x650138, 0x6501c8, 0x6501c0, 0x6501d0.

The result is a command, not immediately the body's axis. `FUN_0056c550` D:L431492-431606 slews increasing
forward magnitude at 0.44999998807907104 times the mode3 multiplier2, but decreasing magnitude immediately;
turn changes at4 times that multiplier, with near-target snap tolerance0.009999999776482582.
RAM addresses: 0x64ffb0, 0x64ffc0 (zero), 0x64ffb8/0x64ffc8, 0x6500ac, 0x64ffd0. Raw setter instructions
0x5678f0-0x5678fc write command slots starting +0x254. These replace instantaneous waypoint-facing and speed.

`FUN_00308b00` D:L207295-207373 projects only strictly between the segment's endpoints. The normal route
advances within five world units, or within the point's width and five-unit corridor, or when the previous
positive facing dot turns negative and the cell distance is below2 or the next point is directly travelable
(`FUN_00567900` D:L429692-429719; RAM 0x6501b0/0x6501b8). FOLLOW's width remains zero. Segment origins come
from the popped point, as `FUN_0056c080` D:L431293-431315 sets the segment after each pop.

Normal lateral correction is **not** a strafe command. Beyond5.5 units from that segment, D:L429876-429890
projects the nearest-point delta onto the local right vector, divides by frame delta, clamps the increment to
+/-5 and adds it to the previous local velocity perturbation. Slot+0x90 targets the omitted export function
at raw instructions0x558620-0x558638, which writes ctrl+0x78c. `FUN_0056fd00` D:L433131-433169 decays that
perturbation by (1-6*dt), resets squared magnitude below0.1, then supplies ctrl+0x198. `FUN_0054d9a0`
D:L416463-416467 adds it to local body velocity and clears that consumed copy. RAM0x650068=6, 0x64fda8=5;
0x66b100 is inverse frame delta, not a fixed gain. This correction passes through the shared collision hull.

Location update separates raw cell from last navigable cell: `FUN_005b7ba0` D:L471288-471318 retains body+0xe8
when the new raw body+0xe4 cell is blocked. A follower no longer stops forever because it briefly enters such a
stored cell. No position is snapped to an AI cell. The all-map physical harness remains a separate acceptance
check; these source-derived rules do not by themselves establish successful traversal or original runtime parity.

The route evaluator consumes passed/near points in the same frame, matching recursive calls at D:L429701-429702
and D:L429716-429717. A bounded loop replaces recursion; the unit regression pins no stationary frame at a
near intermediate point. The final-point extra radius ctrl+0x5dc is reset to zero when requesting the route
(D:L426920-426922), so the five-unit threshold dominates ordinary FOLLOW.

AI-map collision is enabled during ordinary AI setup by its virtual slot+0xb4 (D:L434856). The table at
0x6693f0+0xb4 points to raw function0x557ee0 (absent from the decompiler's function list): instructions
0x557ee0-0x557f24 clear the requested enable only in action mode7 and write ctrl+0x171 bit7. The body checks
that bit and ctrl+0x172 bit0 at D:L413920-413925. `FUN_005b7ba0` D:L471292-471306 sets the invalid bit for a
blocked raw cell only when either packed axis is more than one cell from the last navigable cell;
`FUN_00575cb0` D:L436206-436220 is the inclusive integer interval predicate. The follower requests the planner's
research335 correction only in its grounded normal route state and within that valid location range; the corrected
horizontal displacement first passes through the shared physical hull. The AI correction then runs before floor
selection, matching `FUN_005483d0` D:L413918-413955; no second hull projection follows it. A narrowly optional
shared `Walker.glide` callback resolves all hull substeps before its single correction and floor query, leaving existing player callers
unchanged. The fixture separates a wall from a raised correction destination and checks both ordering boundaries.

The shared mover now receives the current commanded horizontal body velocity before ground movement, so its
floor-exit transition carries it into the fall (`FUN_0054d9a0`, D:L416524-416530; shared mover research80/86).
The regression walks off a raised platform and requires horizontal progress during the next airborne frame;
previously the follower called `glide` with a displacement but left the body velocity zero. This is a unit
transcription check, not an original runtime comparison.

A positional AI correction does not become physical velocity: the follower supplies commanded body velocity
before `glide`, and a zero-command correction over a ledge falls without acquiring horizontal momentum.
Physical actor-priority type1 contact production remains in the named steering placeholder; probe events and ctrl+0x32c bit0 suppression are transcribed in section10. Ordinary initialization, persistent hull4/map2 transitions and forward-probe records are transcribed below.

The correction seam defers floor decisions during intermediate AI hull substeps. A ledge regression starts at
x9.5 on a platform ending at10, requests two units, and corrects back to9: correction runs once and the body
never leaves the floor. Without deferral, the first substep started a fall and skipped the final correction.
Negative forward commands use the civilian backward top11 rather than forward top65 (research199 section3,
`FUN_005e0450`; No_weapon animation bands). An isolated command-to-body regression pins that conversion.

## 6. Persistent obstacles and traversable-cell recovery

`FUN_00557f60` D:L421502-421548 gives obstacle priority: hull4 supersedes map2, a repeated type adds
weight and resets its frame counter, and type0 decay subtracts 0.44999998807907104 times frame delta.
`FUN_00556370` D:L420883-420893 invokes that decay only after five missed frames. These are separate from
elapsed game time since the event began. `FUN_005582c0` D:L421686-421725 stores the first physical hull
contact, resets when its horizontal displacement squared reaches100, and adds weight0.10000000149011612
per call (RAM0x64fd10). The current AI `glide` clears the public wall-hit list before its hull substeps;
ordinary player/traversal calls keep their previous API behavior. The first hit's actual xyz is located in
the AI map; neither body position nor velocity loss stands in for a contact.

The physical map-correction result now supplies the exact first obstructing cell (research335). Its type2
record (`FUN_00558030`, D:L421563-421638, physical param5=0) resets on a different cell unless its Manhattan difference is less than two. The event helper resets
the missed-frame counter before that comparison, so the subsequent less-than-two frame gate is already true. Probe-param5=1 records are transcribed below; physical actor contacts remain within `FOLLOW_STEERING_PLACEHOLDER`; probe-origin type1 records are now transcribed in section10.
The original actor-event priority type1 suppresses map correction; hull4 and map2 do not.

`FUN_00556370` D:L420651-420721 tests elapsed time strictly greater than3 for hull4. Type2 uses
1*max(forward,lateral)+3*(1-max(forward,lateral)), with signed normalized controller axes, and enters
recovery only within Manhattan distance less than2 of its stored cell; otherwise it clears the record.
RAM0x6504a0=100, 0x6504a8=2, 0x6504b0=2, 0x6504b8=5, 0x6504c0=0.44999998807907104,
0x6504e0=1, 0x6504e8=3, 0x6504f8=3, and integer0x650508=3 supply these constants.

Hull recovery marks the commanded-direction neighbor and recorded contact cell soil13 through the
room-private research335 API (`FUN_00556ee0`, D:L420925-421002). It never disables collision or invents
a sidestep. `FUN_00556370` D:L420870-420920 retains the first route point more than three cells beyond
contact and saves the previous navigable actor cell and next point. If no point exceeds the clearance, the route is
retained and the last scanned endpoint is saved; the previous actor cell is ctrl+0x624, updated only when
the navigable cell changes (D:L471307-471318), not the last route segment origin. For a raw cell equal to the retained navigable cell,
`FUN_00603950` D:L512765-512771 enters phase5; D:L512898-512928 registers the saved pair as one request, then
the next alone only when that registration is refused (D:L512917-512926); a search that fails later ends recovery
in phase6 (D:L512951). `FUN_0052c5c0` D:L396351 onward registers those points as one path's legs. Phase6 waits
while the request is queued or searching (D:L512950), then prepends all new points except the endpoint already
retained (D:L512950-512971), then returns to normal route mode3. The request goes through the room's sliced planner
queue (research 333 §6, HOSTAGE-PATH-SLICE, 2026-10-18; was: "The synchronous planner is still the existing
scheduling placeholder; separate controller phases preserve request versus adoption frames", and the fallback was
taken after a failed search too). Targeted tests pin contact priority/time/reset and route retention/fallback.

Remaining recovery scope is named, not silently approximated: unused state2/3 retry branches, actor encounters, and special action-marker dispatch. No-candidate ray selection remains unresolved
(the original indexes the selected entry even when its initial index remains negative); the port ends that
recovery request without inventing an escape point. The all-map physical routes remain independent acceptance
checks and are not original capture parity.

The obsolete authored-only occupancy placeholder is retired: extraction supplies live room actor stamps
through the planner (research335). The original vehicle footprint producer remains a distinct research335
residual; its disc audit found no relevant vehicles on these four hostage maps.


## 7. Blocked raw-cell direct recovery

Reading, independently source-reviewed. `FUN_00603950` D:L512765-512830 requests the retained navigable cell with
priority6 and radius3 if the invalid-navigation bit is clear, enters mode4/phase4, and requests an eight-ray
search otherwise. Phase4 proceeds to phase5 when raw and navigable x/z agree; an exhausted direct request
starts the ray search (D:L512859-512875). Case1 considers rays of distance less than10, choosing the nearer,
a larger actor-height-minus-cell-height on a tie, or a positive drop when the old drop was negative.
The scan initializes distance10000 and drop-999; a failed cell-height lookup supplies-999 (D:L512786-512821).
Its chosen endpoint gets priority6/radius5 and the recovery state exits immediately, leaving the direct
movement request active. The planner supplies the exact rays (research335); no nearest-cell guess is used.

`FUN_0056dba0` D:L432125-432158 installs the target and radius. `FUN_00567350` D:L429198-429283
bypasses its forward obstacle probe for priority6 and invokes `FUN_00566dc0` D:L429105-429154.
That controller independently applies forward PD gains15.753800392150879/64 and lateral gains5/20 to
local target displacement, clamps to the current throttle (side additionally to1), and clears the movement
request at distance less than or equal to its radius. It does not add a target-facing look request.
Mode4 uses slew multiplier1 (RAM0x6500b0), forward rise0.44999998807907104, side rise0.3499999940395355
(RAM0x64ffb4) and immediate side decreases (RAM0x64ffc4=0). Gains are RAM0x650128/12c/130/134;
`FUN_0056c550` D:L431492-431606 applies the slew. Body conversion retains the No_weapon bands65/11/8
(research199 and238); positional correction remains separate from commanded momentum.

Unit RED: missing directStep, adjacent blocked-cell never returned to its retained cell, and missing ray
selection. GREEN: the corresponding transcription/regression tests, alongside existing follower tests.
These are source readings and synthetic physics tests, not measured original traces.


Fresh review corrections: hull obstacle direction rotates both signed controller axes, local
[side,0,-forward], before planner normalization (`FUN_00556370` D:L420690-420718). A selected ray with
failed height/world-point lookup cannot install a direct target (`FUN_0056dba0` D:L432125-432158).

Fish Hook marker map0(217,65) is type1 with archive action ID0xffff (repository AI reader); the route
point(217,66) carries its successor action flag. Raw jump table RAM0x65c990 sends type1 to0x567ee8.
The resolved action valve test at0x567f0c-0x567f18 falls through ordinary movement when nonzero; no
waypoint pop or special bypass occurs for an already-open valve. The cached-cell closing branch
`FUN_00567900` D:L429517-429540 requires a cached cell from previous opening dispatch. Therefore the
observed open door hinge collision does not justify forcing a climb or inventing a door detour.


## 8. Online route forward probe

Reading, independently source-reviewed. `FUN_00567900` D:L429595-429624 asks `FUN_0056a130` to inspect up to30
units toward the next route cell before computing steering. The planner's exact ray visitor is research335.
`FUN_0056a2e0` D:L430383-430458 first records the dot of actor forward and normalized ray direction,
then stops before the target, at distance30, or at a link cell. Soil0/8/9/10 sets a map obstacle; otherwise
an action-bit cell or soil6 also blocks when the initial facing dot is less than0.9. Actor occupancy stops
the ray separately and is not misfiled as a map contact. Vehicle overlap remains within `FOLLOW_STEERING_PLACEHOLDER`; actor resolution is transcribed in section10, with its ordering limitation; the four-map vehicle audit is research335.

FOLLOW is state9 (`FUN_005fcf10` D:L509505-509507), but the slope-probe flag is copied only with
IsNetwork clear (`FUN_0056a130` D:L430343-430345). This server models online escort: that branch is
excluded by the original network gate, not by an assumption that FOLLOW has a different state ID.
Research91/107 identify DAT0x45a0c1 as IsNetwork. The map probe returns flags independently of the ray
iterator's boolean, matching D:L430346-430359.

`FUN_00558030` D:L421570-421628 distinguishes physical contact from probe contact. A probe leaves an
existing physical type2 record's weight and missed-frame counter unchanged; a repeated probe record clears;
a physical contact after a probe reseeds. New type2 probe records retain their probe flag. Regression tests
pin these transitions and the target/link/distance/facing gates. Section10 now supplies actor identity and probe events; physical collision-event production remains owed. A cell occupancy bit alone is not an actor handle.


Probe review correction: the signed shift by58 in `FUN_0056a2e0` D:L430421 selects occupancy bit5
(mask32), not bit6. A regression distinguishes actor occupancy from the independent width bit6.


## 9. Grounded AI hull: centerline, not player disc

Reading, independently source-reviewed. `FUN_0054aa30` D:L415021-415030 asks controller virtual+0x2c. AI vtable
RAM0x6693f0+0x2c points to `FUN_00575c30`, which returns0 (raw instructions0x575c30/34); +0x30
points to `FUN_00575c40`, which returns1. The ordinary grounded AI therefore reaches D:L416025-416044:
a single centerline from the current world position plus step height to current position plus commanded
displacement plus normalized displacement times radius*1.4. Radius is still3.5 from D:L415113-415133;
there is no civilian radius exception. Step height RAM0x44c26c is6.5. Player fan construction starts at
D:L415341 and is not selected for this controller.

`FUN_0054f410` D:L417263-417269 registers segment type2. The segment query admits side bit1 with
camera-skip bit18 clear (research23 and the scene segment reader). `FUN_002d4cc0` D:L175925-175961
selects the nearest hit; ties replace with the later record. Only then `FUN_005483d0` D:L413432-413457
rejects a normalY above RAM0x44c268=0.6427876353263855 or material VOLUMETRIC/LIQUID. Material byte0
uses the map's DefaultMaterial through `FUN_002dc1d0`; the follower receives the existing decoded field
at both spawn and round reset. The normal's Y is flattened strictly below that threshold, normalized,
and its displacement projection subtracted (D:L413527-413568). The AI skips the player's positional
stand-off adjustment (virtual+0x2c at D:L413569-413587). AI-map correction and the floor decision still
follow this hull result in their original order. The ordinary player mover retains its existing path.

A synthetic open leaf begins0.8 units to one side of the centerline: the AI passes, while the player disc
is blocked. A wall spanning the line stops the AI through projection of its command; a coincident later
volumetric hit is rejected after nearest selection, without substituting the earlier wall. These tests
hold the source distinction that was missing at Fish Hook's open hinge. The single physical Safety2
route now reaches extraction; all-map acceptance is recorded by the integration controller. Normal
orientation/model-level first-hit quirks still inherit the scene segment reader's existing reading and
are not claimed as an original running comparison. Non-grounded/special-animation body probes remain
outside this normal grounded controller tranche.


Hull review: AI collision is enabled by init `FUN_00573130` D:L434724-434725 setting ctrl+0x268
word to-1, with global RAM0x44d4d0=0xffffffff (gate D:L415042-415050). When all displacement components
are below0.0005, D:L415010-415018/415135-415149 uses actor facing rather than a tiny displacement's
direction. A regression covers this side-command case. Exactly stationary special animation/curve gates
at D:L415032-415055 remain within the existing special-body residual; this grounded movement API skips
an exactly zero command and does not claim those animation-dependent casts.

### AI contact-climb eligibility (reading, source-reviewed)

`FUN_00550ef0` D:L418119–418155 tests the current motion's looped flag0x40. For a looped ordinary
body (not hang/ladder), with no jump latch, `FUN_0057f2a0` D:L441293–441311 selects the AI branch
through controller virtual+0x30: AI vtable0x6693f0 points to `FUN_00575c40` (returns1). That branch
returns false when controller+0x172 bit1 is set, allowing `FUN_005b4b40`. The normal AI initializer
`FUN_00573130` D:L434754–434756 sets that bit; mode7 changes it according to its action flags at
D:L430842–430843, and leaving mode7 restores it at D:L431706. This is distinct from the player's
Action request at controller+0x170 bit2. Through `motionTableFromArchive`, `RUN/READERC.ZAR`'s
`motion.rdr` marks all three No_weapon locomotion clips (`civ_walk`, `civ_jog`, `civ_run`) looped.

The AI's virtual+0x34 points to `FUN_00544200`, whose RAM instructions return0. Thus contact dispatch
passes that gate at `FUN_005b4b40` D:L469655–469662, subject to the contact/facing tests, and calls
`FUN_005b2620` D:L468292–468514. The latter checks the required clips and contact's appflags; this is
not permission to climb an ordinary wall or mount every ladder. The ladder branch separately requires
AI action mode7 and a reservation (D:L468379–468409). Existing climb geometry/clip playback readings
are research313; the high-climb hang continues through the actual forward command (`FUN_00584390`
D:L443790–443811), not an invented Action press.

Physical diagnostic: Fish Hook Safety's remaining route meets the authored class4 surface
`worldmodel/climbwall/wall_climber_1` while grounded. Its top157.386 and body feet127.816 put it in
the high-climb band; it is not the automatic5..10 step-up. This observation identifies the missing
binding, but is not an original-game capture or proof of the full route.


The hang controller is distinct from ordinary route steering: `FUN_00567900` D:L429849 allows forward
acceleration for actor state4 even when the facing-dot gate fails. After command slew, `FUN_0056c550`
D:L431601–431607 clears side and turn and substitutes forward0.25 only when forward is exactly zero
(RAM0x6500e8). Transcription tests cover both the facing exception and the exact-zero fallback, preserving
nonzero negative commands. This is the original hang continuation, not a synthesized player action.

The room supplies its existing decoded SimClips through the extraction host at spawn and reset; missing
prerequisite clips leave contact climbing unavailable, rather than enabling fallback animation shapes.
The existing browser body snapshot fields carry the resulting traversal pose/blend. That transport is a
browser adaptation using the same encoding as player traversal and makes no original-wire parity claim.


`motion.rdr` raw record membership (Zar + parseRdr + rdrGet) gives NoTurn on `seal_climbcrate`,
`seal_climb_medium`, `seal_stand2hang`, `seal_hang2climbup`, and `seal_hang`; it is absent on
`seal_step_up` and `seal_climb_over`. Only those five suppress ordinary controller yaw during the
active clip. The explicit table is `HOSTAGE_CLIMB_READING`; it does not generalize the player's
older crate-only NoTurn reading to all climb clips. `FUN_00587e00` D:L445581–445593 reads the motion flag; its caller `FUN_00551ec0`
D:L418699–418702 clears turn when that check refuses it. The input-capture seam supplies the controller axes to the existing climb cut/resume
logic before each advance; normal player tick uses the same extracted assignment.


This entry covers normal grounded contact initiation. Airborne jump-grab entry, ladder reservations,
actor-contact suppression and special action-marker controllers remain in `FOLLOW_STEERING_PLACEHOLDER`.
HOLD clears navigation while an active body climb advances independently; the existing death path stops
stepping the body, and dead snapshots suppress traversal fields so the death animation is not overridden.
Round reset constructs a fresh driver and clears its pose. Unit tests cover HOLD body advancement and
snapshot death/reset lifecycle separately from the all-map physical route fixture.


The six entry motion types are0x21 Stand->Hang,0x2c Stand->Ladder,0x2e Climb off ladder,0x2a
Climb crate,0xbb Climb medium and0xba Step up (the last two read from RAM0x3dec90/0x3dec80;
research313 section1.2 maps the anim-set names). A separate **browser missing-data adaptation**
requires the hang, hang-up, hang-jump-down and climb-over playback roots/metadata before binding this AI driver.
This prevents the player's legacy fallback-shape facility from fabricating an AI continuation. It is
not an additional original gameplay eligibility rule: the original's missing-motion transition leaves
the prior top through `FUN_00588bc0` D:L446077–446094. Complete disc packs pass both checks.

Active climb advancement consumes this frame's controller commands before the body driver. Its allowed
turn reaches the existing `Walker.stickCut` test; NoTurn clips supply zero turn. When the climb's
NoInterrupt cut returns ownership to ordinary movement (`FUN_00550ef0` D:L418172–418203; research313),
the follower consumes the already computed movement command in that same frame, skipping a second
contact-climb dispatch from stale hits. Regressions pin command order, turn-only cut input and immediate
movement ownership handoff separately from clip playback.


Review corrections: when hang-jump-down releases body ownership to an airborne fall, gravity runs in
the same frame and continues while the fall pose remains active (existing Traversal hangDropFall / Walker
fall contract, research86). That path uses only hang-jump-down, not an additional traversal landing clip;
its root is included in the separate browser readiness guard. HOLD/rescue physics publishes the driver's
yaw as well as its feet, so an active climb's steer is not frozen in snapshots after navigation stops.
The same raw motion-record audit finds NoTurn absent on `seal_hang_jumpdown`; the controller's turn is
therefore not suppressed by that flag during the drop clip.


## 10. Occupied actor probes and short command suppression

HF-ACTOR, **reading, independently source-reviewed**. `FUN_00569aa0` D:L430132–430162 scans the existing neighbor
list for the first live class2 actor whose retained navigable x/z matches the occupied probe cell, ignoring
map bits. AI ctrl+0x265 bits0/1 exclude that candidate; player controllers do not use those flags.
`FUN_0056a130` D:L430347–430349 clears a missing/self resolution. A bit32 cell is never itself an actor handle.

The route consumer `FUN_00567900` D:L429617–429635 registers type1 only when no map obstacle was returned,
actor resolution succeeds, and `DAT_0066b2c8` is zero. The supplied `spawn_pcsx2.rdram` byte is zero;
`HOSTAGE_AVOIDANCE_READING.actorProbeDisabled=false` records that snapshot default. **Its mutable producer is
unread**, explicitly retained in `FOLLOW_STEERING_PLACEHOLDER`; it is not identified as a network flag.

`FUN_00602b20` D:L512274–512322 gates probe contacts. The caller passes25 (`RAM0x651028`) below225
(`RAM0x651030`). For non-AI targets either actor's full3D speed squared must be strictly greater than50
(`RAM0x651020`, helper `FUN_0050e3d0` D:L380666–380669), and source stance must be below2. AI targets
refuse when prone (stance2) or in Yield state3 targeting the source. Source body105c bit7 set with105d bit0
clear refuses either case. `FUN_00573130` D:L434883–434914 sets that refusal for team10000000, but sets it
for escortee team80000000 only offline. The normal online hostage teamC0020000 therefore does not acquire
it there. Section12 supplies live normal-route Yield identity. The ctrl265 exclusion producer remains absent; it does not become
an invented generic alert default. The read-only actor interface preserves those distinctions for source tests.

`FUN_00558440` D:L421737–421768 and `FUN_00557f60` D:L421509–421544 retain hull4 > map2 > actor1 priority.
Same-type contacts add weight and reset missed frames. Same actor physical contact clears the probe flag.
A changed actor identity explicitly resets type to0, replaces time/cell/identity/weight/probe, and does not
restore type1 in this branch (D:L421746–421755); the next accepted event can establish type1 again.
`FUN_00556370` D:L420724–420742 clears a dead/non-class2 target. Existing five-frame decay applies.
Actor records never enter the type2/4 map-recovery branch.

`FUN_00567900` D:L429626–429635 zeros all controller axes only while the actor event is fresh (missed
frames0) and accumulated weight is strictly below1. This is not an elapsed one-second timer. The follower
retains its route and resumes ordinary steering at weight1. `FUN_005483d0` D:L413930–413938 suppresses
AI-map correction and its map event while the event byte's low bit is set (type1); map2/hull4 do not suppress it.
Physical hull handling and body gravity remain active. Departed/dead actor identity releases the record.

Extraction supplies real player and hostage identities, velocity and last navigable cells on every game frame,
including a fresh binding after round reset. Missing player velocity is omitted rather than guessed. The
actor resolver consumes supplied order. **Exact original ordering is still a placeholder**: `FUN_002a0a10`
D:L145892–145987 maintains a global-roster-derived neighbor list, computes full3D distance squared, and
conditionally resorts a prefix on inversion/cutoff tests. `FUN_002a12e0` D:L146192–146307 uses insertion
sort below21 entries and a rotating-pivot quicksort above. The room currently supplies player then hostage
roster order. Multiple eligible actors in one cell can therefore select differently; no uniqueness filter or
unread nearest-actor rule is substituted. This remains in `FOLLOW_STEERING_PLACEHOLDER`.

Transcription tests cover identity/liveness/exclusion/map-bit handling, ordered selection, strict velocity,
stance/Yield/refusal gates, event priority/reset/decay, weight1 boundary and correction suppression. A synthetic
Extraction regression puts a moving player into an already planned route and removes it, exercising real
occupancy/identity binding. The four-map traversal fixture now stamps both physical bodies and provides their
live actor identities; its results are recorded separately by the controller.

**Still owed:** physical character sweep/contact production (`FUN_0054f7e0` D:L417415–417648), delayed
non-route Yield and physical actor response (`FUN_00557190`), exact neighbor ordering,
and the global disable producer. Short probe suppression is not a claim that actor avoidance is complete.


HF-ACTOR fresh-review corrections: the room roster includes the source body for eligibility data, but the
resolver excludes self **before** selecting a matching actor. Original neighbor construction excludes self
at `FUN_002a0a10` D:L145910; otherwise a source earlier in the roster could hide a valid same-cell target.
Zero controller axes do not zero or freeze an existing lateral velocity perturbation. `FUN_0056fd00`
D:L433132–433169 decays it and copies it to the body input, and `FUN_0054d9a0` D:L416463–416467 adds it
independently of the controller's movement axes. The short actor stop runs decay only (no new route correction),
then applies the remaining velocity physically. Regressions distinguish a blocked same-cell lookup and a
frozen perturbation from the original behavior, including decay to zero before normal route steering resumes.


## HF-SPECIAL: recovery lifecycle and endpoint replacement

**Reading, independently source-reviewed.** `FUN_005f6550` D:L506059-506068 constructs state16 with vtable
0x669ba0. Supplied spawn RAM binds +8 to `FUN_00604490`, +0x10 to `FUN_00603950`, and +0x38
to `FUN_005553d0` (instructions at 0x5553d0/4 return1, permitting obstacle handling).
`FUN_005f6fa0` D:L506385 dispatches the lifecycle callback; push sends event0
(`FUN_005f7ee0` D:L506856-506860), pop sends event1 (`FUN_005f7c40` D:L506750).

Entry clears the obstacle record, elapsed time and reentry count, and clears controller+172 bit1;
exit sets that bit (`FUN_00604490` D:L513029-513040). This suppresses new normal grounded contact
climbs during recovery, without cancelling an active body clip. Its `FUN_00567840` command reset
(D:L429347-429355) clears axes only; it does not clear the separately decaying lateral perturbation.

Obstacle handling precedes the state tick (`FUN_0056e9d0` D:L432512-432513). A refused push of
state16 while that state is already top increments its counter (`FUN_00556370` D:L420831-420849).
That branch jumps to D:L420887 without clearing the contact record: a persistent qualifying event
can increment on successive controller ticks, not only on a new contact edge. Before dispatch,
`FUN_00603950` D:L512758-512761 exits when the counter is strictly greater than integer15
(RAM0x651010, recorded in `HOSTAGE_AVOIDANCE_READING.reentryLimit`). Exit preserves a still-active
direct movement request, as the existing case1 does; a new recovery entry starts a fresh budget.

Phase5 first requires a nonempty completed controller route and saves its original final destination
(`FUN_00603950` D:L512876-512885). Equal navigable actor/saved-endpoint x/z ends recovery without
requesting a path (D:L512894-512899). Otherwise a stored endpoint outside soil0/8/9/10 uses the
existing saved-pair request and single-endpoint fallback (D:L512908-512928). A missing or blocked
endpoint instead clears the old controller route and requests a replacement to the original final
destination (D:L512931-512945). `FUN_005628f0` D:L426989-427000 clears that route;
`FUN_005623b0` D:L426838-426848 succeeds without travel for equal x/z, otherwise requires a
traversable target and a successful request (D:L426850-426871). The replacement must not prepend
itself to the blocked old tail. The request is answered by the room's sliced planner queue, phase6 waiting while
it is pending (research 333 §6, 2026-10-18; was: "Request/adoption remain separate ticks under the existing
synchronous planner adaptation"); failed replacement leaves the old route cleared and exits recovery.

`hostageRecovery.test.ts` isolates source-state transitions: five initial failures and two passing
controls, then eight passing tests including fresh-entry reset/axis preservation. Combined focused
Follow/Avoidance/Actors/ExtractionFollow verification: 79 passed, zero skipped. These unit and dev-disc
checks are separate from the completed integration four-map physical rerun recorded in the HF plan; no original runtime capture
comparison is claimed. State2/3 reachability, special action dispatch and delayed actor yielding remain
outside this tranche. The full original controller's stance-transition scheduling is not added here.


HF-SPECIAL review correction: preserving the perturbation value alone froze body motion on recovery
entry/wait ticks and omitted it from direct movement. `FUN_0056fd00` D:L433132-433169 updates that
independent perturbation each controller tick; `FUN_0054d9a0` D:L416463-416467 adds it after command
movement. Control early returns now decay/apply it once; direct movement adds it to commanded strafe.
Normal route and actor-stop paths retain their existing single update. Active traversal retains body
ownership, including the existing same-tick release path. Three physical synthetic regressions pin
entry/wait/direct displacement (3 decays to2.4 at1/30s, moving0.08 units); the old preservation assertion
was corrected. RED: four failures/seven passes; GREEN combined focused suite:82 passes, zero skips.
This correction is reading, independently source-reviewed PASS (high) at 8b6f95f6d; the reviewer ran 90 tests (82 server and 8 viewer climb), zero skipped. No original-running comparison is claimed.


## 12. Delayed normal-route probe Yield (reading)

Fresh review of f9cd76206: PASS (high), 141 focused tests passed, zero skipped; source ranges and RAM constants independently re-read. Integration and browser acceptance are separate records in the HF plan.

`FUN_00556370` D:L420744–420819 distinguishes probe-origin type1 events from physical contact.
After the strict age>0.1 gate, a probe waits strictly past `1*max(forward,side)+3*(1-max(forward,side))`
before requesting state3; physical contacts retain their separate unresolved handler.
`FUN_00602270` D:L512098–512265 uses horizontal velocity dot>0.5 for a random [0,1) wait,
otherwise normal completed route mode3 requests a perpendicular detour. Success waits0.5;
failure waits U*1.5+0.5. Its rear/moving/aligned branch remains phase0 (RAM66bbb8=0).
`FUN_00601f80` D:L511932–512036 decrements phase4 on the entry tick and exits on dead target
or timer expiry. `FUN_00602d10` D:L512327–512365 clears the contact record on exit.
The entry contact selects movement mode4 for that tick only (`FUN_0056e9d0` D:L432512–432578). Subsequent phase4 ticks retain movement mode3: route steering executes the detour while FOLLOW decisions stay suspended. Independent body perturbation continues on the entry tick as section11 requires. Contact velocity is the incoming body velocity, before the browser physics wrapper can overwrite a grounded sample with zero.

`FUN_00524170` D:L391986–392119 drops a head matching the other actor's raw x/z,
then tries perpendicular world rays in positive/negative order with radius3*10.
`FUN_00524660` D:L392125–392158 accepts the first candidate with both travel legs valid,
and stops at failed distance>=30. `FUN_00537400` D:L403005–403307 supplies changed-cell sampling.
`FUN_00197728/00197740` D:L14514–14535 uses unsigned32 seed and 64-bit LCG
multiplier0x5851f42d4c957f2d, increment1, high31 output; the float transform uses2^-31.
The room shares one Yield stream; it does not claim the original global stream's call order.

Still in `FOLLOW_STEERING_PLACEHOLDER`: non-route Yield modes, physical actor collision/response, mutable phase0 default-wait producer, exact actor roster order.
No original-running trace was taken; focused transcription tests are not capture parity.

### Normal-route stationary-actor point advance

Reading, independently source-reviewed at f9cd76206: `FUN_00556370` D:L420744–420795 runs after strict age>0.1,
requires target full-vector speed squared<=25 (`FUN_0050e3d0`, RAM64ffa0), and
compares target retained navigable x/z with the current route head at Manhattan<=1
(RAM650500), ignoring map bits. `FUN_005fd620/005fd460` D:L509684–509770 resolves
that head and its world point. `FUN_00524d00` D:L392350–392366 pops exactly one;
`FUN_0056c080` D:L431277–431329 resets the segment start to the popped point and
projection progress. The mode3 branch leaves the response flag clear, so the later
probe Yield or physical response still runs. This is not final-goal arrival.

The Yield velocity is actor+0x38 (`FUN_00602270` D:L512091–512105), exposed from
Walker's physical velocity for self and hostage actor views. Snapshot displacement
includes positional AI-map correction and must not become this velocity. Tests
separate a moving body's zero snapshot from a correction-only nonzero snapshot.


The stationary-actor head advance also runs during an existing normal-route Yield wait:
`FUN_00556370` D:L420744–420795 has no state3 exclusion, while phase4 preserves
movement mode3. The stopped entry tick writes zero physical horizontal velocity when
its independent perturbation is zero (`FUN_0054d9a0` D:L416463–416467), without
moving or invoking correction. Airborne and active clip velocity remain body-owned.


## 13. Placeholders

| Name | Status | Evidence needed |
| --- | --- | --- |
| `HOSTAGE_YIELD_SEED_PLACEHOLDER` | placeholder | Explicit seed1 for the room's Yield-only stream. Read original room seeding and all shared RNG consumers; compare a call trace before claiming original random timing. |
