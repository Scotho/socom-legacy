# 176 -- Every retail Suppression map: mechanics and feasibility

Filed 2026-10-04 from the old-layout checkout (`$WT`, the clone's pre-restructure web project), where it was the uncommitted note 101 (WT-101 in the research wave of 2026-10-04, [178](178-the-research-wave-of-2026-10-04.md)); renumbered 176, the cross-references to its sibling notes 171-177 and its plans renumbered with it. Status: reading, pending review.

Audit date: 2026-10-04. Covers MP2 Frostfire, MP5 Abandoned, MP8 Rat's Nest, MP51 Vigilance, MP64 Shadow Falls and MP81 Chain Reaction. Modes come from the disc's `RUN/READERC.ZAR/missionlist.rdr`, not picker labels. See the [all-map audit](172-multiplayer-map-audit.md) and [implementation plan](../plans/2026-10-04-multiplayer-map-parity.md).

This is a source and geometry audit, not a claim that any newly identified mechanic has been implemented or console-validated. **Measured** means the specified local parser/probe ran; **read** means script or executable semantics; **proposed** means implementation work. No extracted assets or decompiled bodies are checked in.

## 1. Scope, method and reproducibility

Each map was independently checked for action records, mission zAnim programs, initial/reset flags, health records and actual scene placements; objective sequences, AI points/zones and authored vehicles were inspected separately. A program name alone is not evidence that a map uses it. Shared model instances were not counted as independent objects merely because both their container and prototype have the same name.

Run from `socomlegacy/`, using locally supplied disc files:

```powershell
npx tsx tools/probe-multiplayer-audit.ts MP2 MP5 MP8 MP51 MP64 MP81 --details
npx tsx tools/probe-suppression-mechanics.ts
npx tsx tools/dump-effects.ts MP81 --mission crane_onoff_1 translate_hook_1 --decoded
npx tsx tools/dump-effects.ts MP51 --mission destroy_access1 --decoded
```

The [inventory probe](../../tools/probe-multiplayer-audit.ts) prints archive SHA-256, primary mode, action bindings, sequence offsets, health parameters, initial-off references and AI metadata. The [mechanics probe](../../tools/probe-suppression-mechanics.ts) measures window/access collision and reads crane translation payloads. Use `dump-effects` **without** `--decoded` when inspecting commands the current decoder omits or incompletely reads; decoded zero scale fields are not zero translation.

`D:Lnnn` denotes the local retail `C:/projects/socom_pc/game/analysis/socom2_game.elf.decomp.c`. Related foundations are [R89 effects](89-effects.md), [R91 rounds](91-the-round.md), [R92 doors](92-doors.md), [R94 arsenal](94-the-arsenal.md) and the new [R174 health/Breach audit](174-breach-map-audit.md).

## 2. Census and negative findings [measured]

| Map | Action records | MZANIM programs | Health blocks | AI submaps / named points / zones | Stored collision polygons |
|---|---:|---:|---:|---|---:|
| MP2 Frostfire | 3 DOOR | 76 | 1, instantiated on three door panes | 3 / 6 / 0 | 3,318 |
| MP5 Abandoned | 0; no actions.rdr | 65 | 0 | 3 / 9 / 0 | 7,119 |
| MP8 Rat's Nest | 0; no actions.rdr | 67 | 0 | 3 / 9 / 0 | 11,842 |
| MP51 Vigilance | 4 DOOR + 5 type-less access records | 92 | 9; five have placed roots | 2 / 9 / 0 | 8,838 |
| MP64 Shadow Falls | 0; empty actions list | 117 | 9; all roots unplaced | 1 / 9 / 0 | 13,093 |
| MP81 Chain Reaction | 2 DOOR + 3 SWITCH | 90 | 0 | 5 / 7 / 0 | 4,202 |

These counts describe stored data, before applying gameplay initial-off state. Collision counts can include coincident instance/prototype polygons and alternate states; they are not a count of unique currently solid faces. Every `vehicles.rdr` in this set contains only a disabled player/start-player record. That does not exclude emplaced weapons: common `ai_turrets.rdr` plus the placed GEO/library parts resolves two on Abandoned, four on Vigilance and three on Shadow Falls ([R177](177-emplaced-weapons-audit.md)). No manual turret bindings resolve on Frostfire, Rat's Nest or Chain Reaction. No NPC rescue/extraction zones or shared-bomb actions occur in this set. All six common CZANIM libraries were also parsed: no health blocks. Negative findings are bounded to the inspected retail map data; they are not assertions about later revisions or all possible engine behavior.

## 3. Suppression rules: shared core, two result-timing variants [read, data]

All six maps' `objectives/start` wait five seconds before objective messages and another ten before elimination checks. All six `mission_timer` sequences wait 15 seconds before watching `mp_timer`; abort increments round count, sets winner 99 and signals mission timeout. Terrorist-empty branches precede SEAL-empty branches, so simultaneous elimination favors SEALs in the script. Existing solo empty-team behavior is an owner exception, not a rule recovered from these maps.

The files are **not identical**, despite the broad comment in `viewer/src/net/rules.ts`:

| Maps | `start` offset / commands | `mission_timer` offset | `success` / `failure` offsets | Hold after elimination before engine's final result handling |
|---|---|---:|---|---|
| Frostfire, Abandoned, Shadow Falls | 428 / 76 | 2272 | 2592 / 2932 | 20 + 1 seconds; no preceding WAIT 2 |
| Rat's Nest, Vigilance, Chain Reaction | 428 / 82 | 2344 | 2664 / 3004 | 2 + 20 + 1 seconds |

The extra six commands are the two-second waits in the six perspective/team outcome branches. `success` and `failure` each wait 20 seconds, advance `round_count`, call match-completion checks, wait one second and set the mission result. The engine subsequently handles the result; the table does not incorporate that later delay. Current `ELIMINATED_HOLD_S = 2 + 20 + 1` applies Vigilance's duration globally, leaving a two-second source discrepancy on MP2/5/64. This is a newly identified reading to validate, not authorization to change a deliberate owner ruling if one exists elsewhere.

All six contain the classic/respawn sequence families (`respawn`, `game_over`, `game_over2`, `start`, `start2`, `mission_timer`, `mission_timer2`, `abort`, `success`, `success2`, `failure`). The current classic-only owner decision stays. Do not reopen a respawn picker because the source contains the old branch. Valve operand-reference flags and embedded `WHILE` predicates still require raw decoding; R171 explains why the effects interpreter is not a complete objective VM.

**Acceptance for every map:** keep the 15-second elimination/timeout guard, branch order, draw behavior and match tiebreakers; source the map's objective/announcer text and result timing independently. Test elimination/timeout on the same tick and all result perspectives. Reconcile presentation delays once, not by stacking a map script delay on top of an existing generic delay.

## 4. Frostfire (MP2): three doors with breakable glass

### 4.1 Bindings and damage path [read, measured]

`READERM.ZAR/actions.rdr` binds `bdoor_4`, `wdoor_1`, `wdoor_2` to matching valves and `singleDoor_right`, range 30 and the door-open prompt. Origins respectively are `(588.757,142,1117)`, `(765,142,991)` and `(897.5,100,995)`. Existing door support is relevant and should remain regression coverage.

The additional missing mechanic is glass breakage. `MZANIM.ZAR/door_slab` has activation 3 and a 24-byte health block: target ref 2 is `pane1`, HP/max HP 1, armor 0, shield 0. It resolves beneath all three placed door slabs. Its sequence calls `breakapane`. That program plays `.GLS_BRK_VSMALL`, emits `DESTRUCTION_SOURCE` and deactivates the pane root. This is a bound damage controller with three placed targets, not an unused template.

| Placed pane | Short full-map segment | Intact -> pane inactive |
|---|---|---|
| `worldmodel/bdoor_4/door1=door1/door_slab/pane1` | `(582.257,157.312,1109.525)` -> `(582.257,157.312,1125.525)` | 2 intersections -> 0 |
| `worldmodel/wdoor_1/door1=door1/door_slab/pane1` | `(772.475,157.312,984.5)` -> `(756.475,157.312,984.5)` | 2 -> 0 |
| `worldmodel/wdoor_2/door1=door1/door_slab/pane1` | `(891,115.312,987.525)` -> `(891,115.312,1003.525)` | 2 -> 0 |

Each pane contributes two stored polygons. These are small projectile/view openings, not proven person-sized traversal routes. Health/shield units use the original damage-controller path (R174), not the web player's normalized health scale.

### 4.2 Feasibility, plan and validation

Feasible after shared scene damage and per-node activation. Add pane damage state independently of door rotation, with correct bullets/blasts, glass fragments/audio, silent late-join application and round reset. Damage a pane while its door is moving; ensure only that pane changes and the door still opens/closes. Test bullets through the cleared aperture, glass surface/penetration policy and reset with the door left open. Capture the original break threshold, fragment behavior and aim visibility before claiming parity.

Other candidates inspected: burning tower effects, two fanblade-start programs, camera/lens programs. Those are ambient/presentation leads; no extra player switch was found. Their visual motion, fire damage if any and camera behavior should remain bounded capture checks rather than invented objectives.

## 5. Abandoned (MP5): two emplaced weapons, no mission action controllers

Independent census found no `actions.rdr`, no mission health blocks and no objective zones. `vehicles.rdr` has one disabled player record. AI submaps are `ground`, `rooftops` and `tunnels`; ordinary named points and spawn data are present. `objectives` is the 76-command start variant above.

`waterfall1_sprays` is an automatic program bound to a placed waterfall root. Lens/inside-state programs also occur. These support presentation, not a new interaction. There is no primary-data evidence here for a hidden bridge switch, C4 access wall or shared-bomb objective.

Two manual weapon roots bind through common turret definitions and their model-library parts: `mp5_turret_lmg` and `mp5_turret_rmg`, respectively LMG and PKM, both with THERMAL. Their independent interaction/occupancy system is scoped in R177; an empty mission action list does not remove it.

**Plan:** implement both emplacements through the shared turret work, preserve Suppression and inspect the 21-second post-elimination script hold against current 23. Validate ground/rooftop/tunnel traversal, water boundaries, waterfall visibility/audio, camera transitions, spawns and normal weapon collision using the existing map/render/traversal suites. No speculative destructible system should be attached merely because the shared engine supports one. Full original playthrough coverage remains owed; absence of action/health records is a bounded negative finding.

## 6. Rat's Nest (MP8): no action controllers; multilevel regression map

No `actions.rdr` or mission health blocks; no objective zones; only the disabled player vehicle record. AI submaps are `Base Map`, `Floor1`, `Floor2`. Player/Charlie/Delta and other named points occur on Floor1, while spectator/Echo/Foxtrot occur on the base map; the correct submap is part of floor selection, not merely XZ.

The objective uses the 82-command start variant with the extra two-second result wait. `translate_sky`, camera jiggle and inside/lens programs are present. Those do not establish a gameplay switch or route alteration. R81 already records a Rat's Nest material-sound gap; retain that reference when assessing presentation instead of claiming this census supersedes the existing sound audit.

**Plan:** keep current Suppression behavior while verifying per-map messages and multilevel spawning, ledges, roofs, camera obstruction, sound materials and sky motion. No new objective implementation is required by the inspected data. This map is an important regression fixture for submap/floor correctness after shared collision changes.

## 7. Vigilance (MP51): five destructible access barriers

### 7.1 Bindings and live versus unused templates [read, measured]

Five type-less action records bind `access_action1..5` -> `set_access1..5` -> `destroy_access1..5`. Each is placed under its corresponding `worldmodel/accessN=accessN` instance. Four additional DOOR actions bind `door_ft_1..4`, each at range 30, to left/right single-door programs.

`access1..5` health programs have activation 3, HP/max HP 1, no armor, shield 17; each binds `good_parts/di_good`. Their command 87 invokes the corresponding action valve. The destruction program guards on context valve 0, invokes `access_destroy`, then sets it to 1. That sequence deactivates `good_parts` and `di_good`, activates `whats_left`, and conditionally runs debris/sound when `skip_effects == 0`. Thus destruction state and transient presentation can be reconstructed separately.

The common health eligibility method accepts C4 when HP is positive and shield is no greater than C4 explosion damage 18 (R174). These five targets qualify. This replaces the current broad heuristic that every type-less action is a C4 target. It does not mean a type-less record is a player-operated SWITCH. Generic prompt selection excludes default action type 8; damage/code paths can still execute it.

`access6` and `plankaccess1..3` health programs are stored but have no placed roots here. They are not four additional Vigilance barriers.

### 7.2 Geometry consequences [measured]

The mechanics probe applies authored healthy/destroyed subtree activity and searches short segments across actual vertical faces. For each live barrier it finds two intact intersections and no destroyed intersections:

| Instance | Healthy / destroyed stored polygons | Representative segment |
|---|---|---|
| access1 | 16 / 1 | `(1490.645,54.766,1041.2)` -> `(1490.645,54.766,1057.2)` |
| access2 | 7 / 19 | `(1573.427,40.670,517.376)` -> `(1560.072,40.732,508.565)` |
| access3 | 16 / 1 | `(334.897,149.307,1161.302)` -> `(318.897,149.307,1161.302)` |
| access4 | 16 / 10 | `(985.469,105.538,1072.348)` -> `(987.469,105.558,1075.812)` |
| access5 | 18 / 8 | `(897.420,48.211,725.579)` -> `(904.342,48.211,721.569)` |

An increase in polygon count can still create an opening (access2). The short probes prove local changes in obstruction, not complete traversable routes; access4's witness is only four units long. Standing/crouching capsule paths, remaining frames and actual approach directions must be checked separately.

### 7.3 Feasibility, plan and validation

Feasible with shared health eligibility, server damage delivery and authored-state activation. Current C4 placement/visual blast alone is insufficient: `match/src/room.ts` blast processing damages players, not these scene health controllers. Keep the four functioning doors intact while adding the five persistent access states.

Test C4 acceptance from the health target, damage threshold/occlusion, duplicate damage, each barrier independently, all reset states, late join with `skip_effects`, and projectile/mover agreement. Mission `Enable_c4=9` explicitly allows C4 for both factions; validate that source availability reaches the loadout and action paths. Shield 17 also permits the RPG's source explosion damage 20 but excludes M67 damage 10 before falloff/occlusion. Add map-specific route captures before attaching community landmark names. Four PKM placements `mp51_turret01..04` also require the independent R177 subsystem.

## 8. Shadow Falls (MP64): three turrets, unplaced access templates and ambient state

`actions.rdr` exists but contains no actions. Nine health programs (`access1..6`, `plankaccess1..3`) exist, but none of their roots occur in the placed scene. No rescue zones, live vehicle records or initially-inactive mission node references were found. The objective is the 76-command/21-second result-hold variant.

Automatic ambient programs include `bugs_flying`, 27 `loop_torch*` placements, five falling-water sounds and two rain-drip programs. Their presence explains a comparatively large mission library without implying nine live destructible barriers. Most particle/light/sound operations have existing support; the bug animation also contains command 75, which remains an explicit decoder/presentation investigation.

Three manual PKM roots `mp64turret_1..3` resolve through common turret definitions and model-library parts, all with THERMAL (R177). They are separate from mission action and health programs.

**Plan:** implement those three emplacements through the shared turret work. Validate torch/water/insect effects, night visibility, camera inside/outside behavior, terrain/climb/cave routes and source-specific round hold. Do not instantiate the unplaced access templates. Capture whether any ambient source has actor damage before adding a hazard; a fire-looking particle effect alone is not damage evidence.

## 9. Chain Reaction (MP81): three independently pausable cranes

### 9.1 Controls and state [reading]

| Action | Valve / program | Position | Range / elevation |
|---|---|---|---|
| `epan_1` | `crane_v1` / `crane_onoff_1` | `(1118.335,75.5,1889.718)` | 15 / 15 |
| `epan_2` | `crane_v2` / `crane_onoff_2` | `(1118.335,75.5,1801.718)` | 15 / 15 |
| `epan_3` | `crane_v3` / `crane_onoff_3` | `(1118.335,75.5,1321.718)` | 15 / 15 |

All are SWITCH actions with the lever prompt and no authored team restriction. Two separate DOOR actions operate `door_drydock21` and `door_drydock22`, range 30, using right/left door programs.

Each auto-start `swing_hook_N` calls its own `translate_hook_N` and `sound_hook_N`. A round starts with `crane_vN` at 0 and `hookN_moving` at 1 (`sound_hook` is what sets the moving valve), so the first press takes the pause branch. That branch invokes `control_pause_N`, sets the context valve to 1, sets `hookN_moving` to 0 and pauses **translation**. The other branch invokes `control_resume_N`, sets those valves to 0/1 and resumes translation. The swing animation is not paused by that command; do not freeze the entire crane scene as a shortcut.

The control meshes are not children of `epan_N`. `control_pause_N` and `control_resume_N` are rooted at `hcont_N`, and the two meshes are `worldmodel/hcont_N/control_switch=control_switch/go_on_switch` and `.../go_off_now` (`CRANE_CONTROL_ROOT_READING`, `CRANE_CONTROL_SWITCH_READING`). A round starts with `go_on_switch` shown and `go_off_now` hidden: that node's reference has deactivate and saveActive (`FUN_0026b5e0` D:L115740-115750). A resume shows `go_on_switch` and hides `go_off_now`. A pause does the reverse. There is no separate lever animation on the disc; the mesh swap is the lever. The room broadcasts the action event, so every client runs the presentation program, which plays the sound. A presentation run changes no node and writes no valve (PF.R26). The page therefore draws the meshes from the snapshot, and it writes each snapshot's `crane_vN` onto its world so the program tests the valve the room had (`CRANE_SWITCH_MESH_READING`, `CRANE_ONOFF_UNDECODED_READING`). `crane_onoff`'s set-2 commands 16, 20 and 5 stay unread. The disc check of head `5471db584` (2026-10-18) found the earlier paths `worldmodel/epan_N/go_on_switch` and `go_off_now` are not on the disc (the map notes already said the meshes were missing), and that both meshes visible at load is not the start state. It is a reading of the disc and of that port, not a capture of the original running.

`sound_hook_N` starts/stops/retunes `~CRANE` based on `hookN_moving`. It contains conditional WHILE predicates; the current simplified effect decoder is not sufficient to reproduce the sound state machine. `~CRANE` stays `CRANE_SOUND_PLACEHOLDER`.

### 9.2 Authored motion and collision [reading]

The root motion is along Z, not a guessed vertical lift:

| Root | Initial position | First / return relative Z displacement | Duration each way | Stored child collision polygons |
|---|---|---|---|---:|
| `worldmodel/hook1` | `(1286.347,130.5,1877.293)` | +230 / -230 | 15 seconds | 4 |
| `worldmodel/hook2` | `(1356.347,130.5,1797.150)` | -320 / +320 | 15 seconds | 16 |
| `worldmodel/hook3` | `(1226.347,130.5,1077.293)` | +280 / -280 | 15 seconds | 4 |

`translate_hook_N/Seq_Data` commands at 48 and 160 have flags `0x9` (`CRANE_TRANSLATE_FLAGS_READING`), duration at +0x34, and a translation payload pointed to by u16 +0x0c (value 56). Delta is at payload +0x10 and rate at +0x1c. Bit 0x1 is the relative target (`FUN_0025fe70` D:L109234-109244 adds it to the current translation). Bit 0x8 is set; what it changes is not read (`CRANE_TRANSLATE_FLAG8_READING`), and the motion stays that relative translation. The disc check of head `8881c80d9` (2026-10-18) read X and Y of each delta as 0, the rate as delta/15, and the leg table above. The two legs repeat because a WHILE with its forever bit set follows the return, not because a `LOOP` command does (`CRANE_CYCLE_REPEAT_READING`). The published Z pair sums to zero, so the repeat closes. Retail begin `FUN_0025fe70` (D:L109109 onward) resolves this payload and initial node position; tick `FUN_0025f9b0` (D:L108958-108999) advances translation and resolves the endpoint. `decodeEffectOp` used to read scale vectors at fixed +0x38/+0x44, producing zeros for these commands; the viewer's general effect `fromTo` host still applies that scale. The decoder now also reads the position block into `translation` (`packages/scene/src/effects.ts`). The door-specific rotation host does not solve root translation; `packages/viewer/src/cranes.ts` does, for these three hooks only.

`swingplate`, the child of `hookN`, alternates one-second angular motions about its local X, initial speed +/-0.06981317 rad/s and acceleration -/+0.13962634 rad/s², then restores rotation. The same disc check read those three numbers. The angle is applied to that node (`CRANE_SWING_NODE_READING`, `CRANE_SWING_AXIS_READING`) and carried on the snapshot as milliseconds into the two-second swing. The hook's collision hull stays the translation only. Authored moving child collision is present. Its stored counts include repeated instance/prototype polygons and do not establish unique surfaces, crushing damage or whether the original carries a standing player. Those stay `CRANE_RIDE_PLACEHOLDER` and `CRANE_CRUSH_PLACEHOLDER`.

`epan_N` and `hcont_N` are not children of `hookN`. The disc paths are `worldmodel/epan_N` and `worldmodel/hcont_N`, siblings of `worldmodel/hookN` (the control-mesh check of head `5471db584`). `translate_hook_N` is the only translation, and it is the hook's. A child of the hook inherits that matrix; those two roots do not, so moving only `hookN` leaves their pieces still. They take the same legs, the same rate and the same pause (`CRANE_PANEL_WITH_HOOK_READING`). The swing is not applied to them. A piece hung under the hook keeps the translation, and a piece under `swingplate` keeps the swing. World-model geometry under those roots was baked into the static map draw, so it stayed put even when its path was under the hook; the load keeps that geometry as its own placement so the same translation reaches it. `origin/main` has no crane runtime, so nothing there moves; the still panels are this branch. The attachment is a reading of those paths and of the hook's already-read legs, pending review: it is not a second command, and it is not a capture of the original running. Dustin, 2026-10-21, the panels move with the cranes. The phase is the snapshot the hook already carries, so a late joiner does not restart the panels on their own.

The disc check of head `37585f7a8` (2026-10-21) read `hook1` and `hcont_1` moving together, the swing on local X, and cranes 2 and 3 on their published legs. It found no drawn object whose path was `epan_1`, `epan_2`, `epan_3` or `go_on_switch`. `go_on_switch` and `go_off_now` are children of the realised `control_switch` prototype, so the three cranes shared one instanced draw and the paths sat on `nodePaths` rather than `nodePath`. A world-model node with no visuals is not placed (`placeInstances` keeps a node only when it has visuals). The load now emits each placement under the hook, `epan_N` or `hcont_N` as its own mesh, including a facade, and does not frustum-cull it. Instance placements peeled out of one shade group still share that group's decoded arrays. The worker's transfer list names each buffer once; listing it again detaches it and `postMessage` throws `DataCloneError`, which is what head `a7b68544f` did while loading MP81. A riding path that decodes to no mesh is noted and not invented. `window.__crane` is a test-room read of those draws and of the pause; it is not the game. Pressing the lever on that build left the crane moving and `go_off_now` hidden. The page poses the hull, then the room catches up, and a slow frame (the simulation step is clamped at 0.1 s) puts the struck point more than one unit ahead of the room polygon, so the line misses and the toggle never runs. A crane press allows one such step of the fastest leg on top of that unit. With no player match the press never reached a room; the page pauses its own hooks only then. Standing on the hook still drops the player (`CRANE_RIDE_PLACEHOLDER`): the hull moves and the body is not carried. No capture says whether the original carries, pushes or crushes, so carrying is not a small add.

The disc check of head `43face3ef` (2026-10-21) loaded MP81. The `hcont_N` controls moved with the hook. `__crane().pieces` for each `epan_N` was only that root, with `drawn: false` and no position: no mesh under the path was in the scene, so the split had nothing to peel. A child of a prototype the map instances and also defines (the `control_switch` under `hcont_N`) is already placed, and `__crane` lists it. A prototype the map instances and does not define is not realised, and a buffer that stores the fallback chunk names (`N###_###`) is missed when the placement asks for `N###_I###_V##`, so that path decodes to nothing and is not drawn. The disc check of head `f67fbb725` (2026-10-21) showed that neither of those is what MP81 draws. `epan_1`..`epan_3` are empty nodes: no children, no instance, no model and no visuals. MP81 instances no prototype it does not define, and the load writes no fallback-chunk note. There is no mesh under `epan_N`. `__crane().pieces` for that path stays the undrawn root, `drawn: false`, no position. The drawn lever is `go_on_switch` and `go_off_now` under `hcont_N`, and those already move with the hook. The collision on `epan_N` moves with it: at 5 s steps its z read 1903, 1980, 2056, 2106. A press sent in the same frame as the prompt, feet at y 65, reached the room on `epan_N` and was dropped `missed` on all three cranes. The head's line does meet the room's face. On a shallow look that meeting is far from the point the page named, so the along-ray slack refuses a face that is itself within the same slack. That face is the press. A ray that entered a nearer face of the owner before the point, the point not on that face, stays `missed` (LATER 121). A point farther than the slack from every face of the owner still misses. A press whose command is more than three ticks behind the room is `stale` and is not told to the page; a mounted seat and a release in progress are refused before the line; then the reach. The disc check of head `5650f30be` (2026-10-22) still dropped the press `missed` on all three cranes, with the prompt up: `__viewer.action()` was 0/3 and a real X was 0/15 (the prompt on 13 of those). The page hull and the room hull were not the same pose. `show` poses the page, and the offline room is created later, when the armory closes (`simMapOfLoaded` forks the walk hull). The page had been stepping that hull, so the fork captured the moved polygons as the room's rest while the page's own rest stayed the disc's. The snapshot then put both clocks on those different bases, and the gap was the motion from before the fork, larger than the slack on every crane. The page now leaves the hull at the disc rest until a snapshot names the hooks. A development build reads the room's last miss as `__room.lastActionMiss` (the named point, the eye, the ray, the room's faces, the nearest distance, the slack, and both offsets at that tick). It changes nothing the game does. Reading, pending review.

### 9.3 Feasibility and implementation plan

Feasible, but needs continuously moving-world support beyond Crossroads' stable-state swaps. Decode translation payloads and pause/resume, bind each world root, move child render/collision transforms, update broad-phase swept bounds, and synchronize phase/direction/paused-at time. Snapshots must preserve the exact paused phase, not restart a 15-second leg on resume or join. Initial hook/control state and audio must reset each round.

Test each of the three controls, independent pause/resume mid-leg and at turnarounds, swing continuing while translation pauses, correct control indicator, sound pause/resume, bullets/camera/grenades and actors at the moving obstruction. Capture player contact to decide pushing/riding/crushing policy; do not add damage just because a hook moves. Include correction against the right motion phase under latency and late join. This map is the strongest evidence that the shared environment layer needs transforms as well as active flags.

## 10. Shared implementation risks and per-map task ownership

| Task | Scope | Prerequisite / acceptance |
|---|---|---|
| SUP-01 | Source-specific Suppression metadata and result delays for all six | Preserve owner countdown/solo rules; test 21 versus 23 script seconds separately from engine end handling. |
| SUP-02 | Frostfire panes | Shared damage/activation plus existing moving doors; three independent pane states and round reset. |
| SUP-03 | Vigilance five access barriers | Health-bound C4 eligibility, damage to scene objects, final hulls/debris and route captures. |
| SUP-04 | Chain Reaction three cranes | Translation/pause/resume, moving hull bounds, authority and phase recovery; contact behavior sourced. |
| SUP-05 | Abandoned, Rat's Nest, Shadow Falls regression/presentation | No fabricated action targets; multilevel/cave/water, ambient and camera captures, map-specific sound gaps. |
| SUP-06 | Nine emplacements: Abandoned 2, Vigilance 4, Shadow Falls 3 | Shared R177 mount/aim/fire/dismount and network work, including thermal; every placement validated. |

Crossroads' common findings apply: owner activity must reach descendants; mover caches must invalidate even while a player remains in one cell; each room must fork mutable owner state; snapshots must apply geometry before replay/correction; reset occurs before spawn. Ongoing motion also needs authoritative phase and historical collision policy for rewound shots. No original-network replay claim follows merely from the existence of an action valve.

These tasks feed the all-map plan. Functional regression tests and small data-derived manifests are appropriate to commit; local archives, decoded raw scripts and original captures remain ignored. All six maps have been inspected at source level. Original-device/capsule/contact captures listed above remain validation work, not completed measurements.

## 11. Readings and placeholders

The hook runtime (`packages/viewer/src/cranes.ts`) names these. Re-filed 2026-10-22 at the #337 takeover (OT.R69) to the confidence levels (PROCESS, "Confidence"): a row marked *reading, pending review* is transcribed from the disc's bytes through the repository's readers (the command bytes at heads `8881c80d9` and `5471db584`, 2026-10-18; the second check corrected the control-mesh path and the start state) and becomes a reading once the takeover's fresh review re-reads it at the source. The port watched on MP81 at those heads and at `37585f7a8` (2026-10-21, what §9.2 records about the instance draw and the press) is a rendered browser run of the port, kept apart: it shows the port doing what it was built to do, not the original. None of these is a capture of the original running, so none is proven. An open row is still unread; an adaptation row has no original.

| Name | What the code does with it | Status |
|---|---|---|
| `CRANE_DELTA_XY_READING` | X and Y of each leg's delta are 0. The disc check read both commands of each `translate_hook_N`. | reading, pending review |
| `CRANE_LEG_SECONDS_READING` | Each leg lasts 15 seconds. The disc check read the f32 at payload +0x34. | reading, pending review |
| `CRANE_RATE_FROM_DELTA_READING` | The rate floats are the displacement over those 15 seconds. The disc check read P+0x1c. | reading, pending review |
| `CRANE_CYCLE_REPEAT_READING` | The two legs repeat because a WHILE with its forever bit set follows the return leg. It is not a `LOOP` command. The published Z pair sums to zero. | reading, pending review |
| `CRANE_TRANSLATE_FLAGS_READING` | The translation command's flags word is 0x9. Bit 0x1 is the relative target (`FUN_0025fe70`). | reading, pending review |
| `CRANE_TRANSLATE_FLAG8_READING` | Bit 0x8 of that word is set. What it changes is not read. The motion stays the relative translation of bit 0x1. | open |
| `CRANE_SWING_SPEED_READING` | The swing's initial speed, 0.06981317 rad/s, sign alternating each second. The disc check read it. Applied to `swingplate`. | reading, pending review |
| `CRANE_SWING_ACCEL_READING` | The swing's acceleration magnitude, 0.13962634 rad/s², opposite the speed. The disc check read it. | reading, pending review |
| `CRANE_SWING_SECONDS_READING` | One angular motion lasts 1 second, then the angle is back at zero. The disc check read the lifetime. | reading, pending review |
| `CRANE_SWING_NODE_READING` | The node is `swingplate`, the child of `hookN`. The angle is applied to it. | reading, pending review |
| `CRANE_SWING_AXIS_READING` | That node rotates about its local X. | reading, pending review |
| `CRANE_VALVE_START_READING` | `crane_vN` starts at 0, so the first press takes the pause branch. | reading, pending review |
| `CRANE_MOVING_START_READING` | `hookN_moving` starts at 1. `sound_hook` is what sets it. | reading, pending review |
| `CRANE_SWITCH_MESH_READING` | `go_on_switch` is shown at load and `go_off_now` is hidden (deactivate and saveActive). A resume shows `go_on_switch` and hides `go_off_now`. A pause does the reverse. The mesh swap is the lever. | reading, pending review |
| `CRANE_SWITCH_ON_NODE_READING` | The mesh a resume shows: `go_on_switch`, under `hcont_N/control_switch`. | reading, pending review |
| `CRANE_SWITCH_OFF_NODE_READING` | The mesh a pause shows: `go_off_now`, under the same instance. | reading, pending review |
| `CRANE_CONTROL_ROOT_READING` | `control_pause_N` and `control_resume_N` are rooted at `hcont_N`. The meshes are not children of `epan_N`. | reading, pending review |
| `CRANE_CONTROL_SWITCH_READING` | The instance under that root is `control_switch=control_switch`. The two meshes are its children. | reading, pending review |
| `CRANE_PANEL_WITH_HOOK_READING` | `epan_N` and `hcont_N` take the hook's translation. The swing stays on `swingplate`. A pause holds the translation on the hook and on both panels. `epan_N` is an empty collision node: no children, no instance, no model. The drawn lever is under `hcont_N`. A shallow look that meets the moving face far from the named point is accepted when that face is within the press slack. The offline room forks the walk hull, so the page leaves that hull at the disc rest until the room's snapshot names the hooks; a page that steps first makes the moved pose the room's rest. The paths, the hook's legs, and the disc checks of `f67fbb725` and `5650f30be`; not a capture. | reading, pending review |
| `CRANE_ONOFF_UNDECODED_READING` | `crane_onoff`'s set-2 commands 16, 20 and 5 are not decoded. The mesh rule above is read off the disc's deactivate and saveActive bits (reading, pending review); the commands stay unread. | open |
| `CRANE_RIDE_PLACEHOLDER` | The hull moves. A standing body is not carried. | open |
| `CRANE_CRUSH_PLACEHOLDER` | A hook deals no damage. | open |
| `CRANE_SOUND_PLACEHOLDER` | `~CRANE` is not played. `sound_hook_N` needs the conditional WHILE the effect decoder does not reproduce. | open |
| `CRANE_PRESS_SLACK_ADAPTATION` | A network adaptation (the original's press and hull are one console's): a crane press is judged against the room's hull within `CRANE_PRESS_BASE_SLACK` (1, `C4_SURFACE_SLACK_PLACEHOLDER`'s value) plus the fastest leg's travel over the press's lag and `CRANE_PRESS_FRAME_SECONDS` (0.1 s, the page's drawn-frame clamp in `main.ts` and `matchMount.ts`); and, when the head's line misses, the named node's nearest face within that slack (`craneSurfaceOffRay`, the head's line only). The page draws the hook at its newest snapshot plus one frame while the room judges at the press's command, so the room is ahead by about the round trip plus the snapshot's age (the #337 review's F1, 2026-10-22; was: "the page's hull up to one frame ahead", which dropped a press above a round trip of about 110-130 ms). The lag is the room's tick less the page's view clock (`Player.viewTick`, the page's claim), clamped to `CRANE_PRESS_LAG_BOUND_ADAPTATION` (`MAX_REWIND_MS`, 200 ms, the shots' rewind bound): a forger gains at most that term, about 4 u on hook2. Only for a crane's valve. LATER 325: the hook rewound to the view tick. | adaptation |
| `CRANE_PRESS_LAG_BOUND_ADAPTATION` | `CRANE_PRESS_SLACK_ADAPTATION`'s lag bound: `MAX_REWIND_MS`, the most of the page's claimed lag counted. | adaptation |
| `CRANE_PREDICT_ADAPTATION` | P8 (2026-11-02; `viewer/src/cranes.ts` `CraneSet.predict` / `applyWire`, `cranePage.ts` `press`): a network adaptation (the control is a SWITCH, which the original runs on the pressing console: `FUN_00592d50`'s 0x2000 branch -> `FUN_002b44e0`, research 213 s4). The page toggles its own hook at the press -- the meshes swapped, the hook paused or resumed -- and holds it, stepping locally, until the room's word: a snapshot on the predicted valve is the room's toggle and the snapshot is laid on again (the hook jumps by its travel over about the up-link delay); one acking a command past the press's on the old valve, or with no own body, is a refusal and the snapshot's state is laid back at once (no sound: `CRANE_SOUND_PLACEHOLDER`). Costs: a refused press's swap was seen; another's toggle just before this press reads as this press's until the next snapshot. | adaptation, reading, pending review |

**The crane SWITCH's points** (the #337 takeover, point 4, 2026-10-22; reading, pending review). A crane press scores its record's `points` (`MapAction.points`, the record's `+0x38`) once a round, on its first press: `FUN_00545530` has three callers: the host's two -- D:L160566 (`FUN_002bb310`, guard D:L160549-160550) and D:L160645 (`FUN_002bb5b0`, guard D:L160627-160629) -- score only while the record's `+0x3f` bit 1 is clear and its points non-zero, then set the bit; the third, D:L160668 (`FUN_002bb770`), is a peer applying the host's score message, unguarded, then setting the bit (the review's F2); `FUN_002b5510` clears it at the round (`net/objectiveScore.ts`). The room keeps that bit for the hooks apart from `markUsed` (`Room.craneScored`, cleared beside `cranes.reset()`), since `markUsed` also refuses the action's next use and the hook's control toggles every press. Was (the pull request as written): the press never scored. MP81's own records, read 2026-10-22 (the disc test `cranes.test.ts` "#337 takeover, point 4"): `crane_v1`..`crane_v3`, each a SWITCH of 0 points -- so on MP81 the score adds nothing; the rule holds for any record that carries points.

Still open on MP81:

- What bit 0x8 of the translate flags changes (`CRANE_TRANSLATE_FLAG8_READING`).
- The meaning of `crane_onoff`'s set-2 commands 16, 20 and 5 (`CRANE_ONOFF_UNDECODED_READING`).
- Which of the stored child collision polygons are unique surfaces (the counts in §9.2 include repeated instance and prototype polygons).
- A capture of a player standing on a hook: ride, push, or crush. Until that capture, the body is not carried and the hook deals no damage.
- `sound_hook_N`'s conditional WHILE, and `~CRANE`.
