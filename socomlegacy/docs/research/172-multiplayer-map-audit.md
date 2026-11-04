# 172 -- Every online multiplayer map: source audit and feasibility

Filed 2026-10-04 from the old-layout checkout (`$WT`, the clone's pre-restructure web project), where it was the uncommitted note 97 (WT-97 in the research wave of 2026-10-04, [178](178-the-research-wave-of-2026-10-04.md)); renumbered 172, the cross-references to its sibling notes 171-177 and its plans renumbered with it. Status: reading, pending review.

Audit date: 2026-10-04. **All 22 available retail maps received the Crossroads audit process.** The three HDD maps are tracked separately as awaiting source data, following the owner's confirmation that those maps are not available. This document records source coverage and implementation feasibility; it does not mark new gameplay implemented or original-runtime parity achieved.

The [implementation plan](../plans/2026-10-04-multiplayer-map-parity.md) assigns shared systems, per-map rollout and acceptance. The original [Crossroads plan](../plans/2026-10-04-crossroads-demolition-and-bridges.md) remains the first delivery increment: the shared Demolition bomb and two independent bridge switches.

## 1. Coverage and evidence standard

The local `RUN/READERC.ZAR/missionlist.rdr` identifies 22 retail multiplayer maps: six Demolition, three Breach, four Extraction, three Escort and six Suppression. Every available map was independently inspected; Crossroads was a process template, not a substitute for checking the others.

For each map the wave inspected mode/configuration, mission reader records, objective sequences, actions and their placed roots, mission/common animation libraries, health controllers, initial/reset references, AI points/zones/submaps and scene collision. A separate common-definition/model-library pass covered mounted weapons, which bypass mission action lists. The reports join evidence to current viewer/server gaps and give per-map acceptance cases. Existing corpus rendering, traversal, weapons and sound audits remain applicable; this wave does not claim to have re-recorded every visual or sound effect.

| Evidence label | What it establishes | What it does not establish |
|---|---|---|
| Data / measured | Local bytes parsed; named instance/part resolved; specified geometry query ran | Original-console input behavior, player-capsule routes or final visuals |
| Read / reading | Script flow or retail executable behavior reconstructed with addresses/offsets | Decompiler correctness at an ambiguous branch, exact displayed timing or a successful network match |
| Inference | A conclusion supported by explicit facts, with a stated closure experiment | A recovered rule suitable for silent hard-coding |
| Proposed | Web architecture, ordering, validation and ownership | Existing implementation or original network protocol compatibility |

Source hierarchy follows [MISSION](../MISSION.md) and [CONTRIBUTING](../../CONTRIBUTING.md): main project/recomp and retail data/executable first, reCOM declarations as corroboration, community accounts as landmark/capture leads. Common templates, an effect name, a disabled vehicle or a file named after an objective are not enough to establish a live mechanic.

The external [SOCOM map list](https://socom.fandom.com/wiki/SOCOM_map_list) corroborates the three HDD names/mode labels; it is not evidence of their scripts, geometry or runtime behavior. The public search also surfaced later SOCOM 3 versions of those maps; their added modes must not be imported into the SOCOM II audit. Crossroads' original community-guide/manual references and their limits are retained in R171.

## 2. Detailed reports and reproduction

| Report | Scope | Principal contribution |
|---|---|---|
| [171: Crossroads](171-crossroads-demolition-and-bridges.md) | MP72 | Shared bomb and independent bridge detonators; measured under-street blockage; initial/reset and authority gaps |
| [173: Demolition](173-demolition-map-audit.md) | MP1, 7, 9, 12, 72, 83 | Six objective configurations, damage-controlled props/buildings, Requiem barriers, equipment differences and AI-height trace |
| [174: Breach](174-breach-map-audit.md) | MP61, 62, 73 | SEAL bomb restrictions, gates/barriers, lights, radios, aircraft, damage thresholds and 12 local collision witnesses |
| [175: Extraction and Escort](175-extraction-and-escort-map-audit.md) | MP6, 10, 11, 71, 52, 53, 82 | Three objective NPCs per map, distinct mission policies, region/submap semantics, penalties, gates and Guidance strike |
| [176: Suppression](176-suppression-map-audit.md) | MP2, 5, 8, 51, 64, 81 | Result-timing variants, breakable panes, five Vigilance barriers and three crane controls |
| [177: Emplaced weapons](177-emplaced-weapons-audit.md) | All 22 | 43 manual weapon placements across 15 maps, full part binding, definition lookup and shared turret work |

Run metadata probes from `socomlegacy/` against the locally supplied archives:

```powershell
npx tsx tools/probe-multiplayer-audit.ts
npx tsx tools/probe-multiplayer-audit.ts MP72 --details
npx tsx tools/probe-crossroads.ts
npx tsx tools/probe-demolition-maps.ts --programs
npx tsx tools/probe-demolition-maps.ts MP83 --animation access --barrier-probes
npx tsx tools/probe-breach-maps.ts
npx tsx tools/probe-npc-maps.ts --section bindings
npx tsx tools/probe-suppression-mechanics.ts
npx tsx tools/probe-map-turrets.ts
```

The common inventory prints archive SHA-256, mode, counts and optional exact bindings/offsets. Specialized probes preserve raw command offsets, animation ordinals and unresolved references; command-debug options can print local payload words. Detailed notes supply additional commands and source locations. Scratch output and retail bytes stay in ignored local storage; the tools do not write or extract asset files.

Method checks caught and corrected two important analysis errors during the wave: decoded effects omit `QUAD_ALIGN`, so decoded indices cannot be paired directly with unfiltered raw offsets; `OBJECT_MOTION_FROM_TO` translation uses a pointed payload whose leading flag word shifts the vector relative to the existing decoder's assumptions. Both corrections are reflected in the probes and findings. No gameplay decoder was modified as part of this planning task.

## 3. Complete retail map ledger

**Every row below is source-audited, implementation pending where listed.** Mount counts are manual definition plus three-part bindings from R177. They do not include name collisions or unplaced common templates. Absence findings remain bounded to these supplied archives.

| Map / source | Mode | Environmental and objective findings | Mounted weapons | Per-map validation emphasis |
|---|---|---|---:|---|
| MP1 Blizzard / R173 section 5 | Demolition | Two plant sites/shared bomb; six doors, two damage-controlled outhouses and three glass windows | 0 | Door/glass independence, outhouse damage, reset and both plant sites |
| MP2 Frostfire / R176 section 4 | Suppression | Three doors with independently breakable glass panes; 21-second script result hold | 0 | Pane breaks during rotation; projectile aperture; do not turn `tank1` props into weapons |
| MP5 Abandoned / R176 section 5 | Suppression | No mission action/health controllers; waterfall and three-level ground/roof/tunnel layout; 21-second hold | 2 | Thermal LMG/PKM, vertical navigation/camera/water and timing |
| MP6 Desert Glory / R175 section 5.1 | Extraction | Three hostages; one live access barrier, one door with hostage-route geometry variants, numerous bound prop families with repeated child names | 0 | Hostage lifecycle/penalty, correct floor, mission door override, instance-scoped bottles/lights/cups, damage callback thresholds |
| MP7 Night Stalker / R173 section 6 | Demolition | Shared bomb; 22 non-base damage controllers including dishes, antennas, tables, crates, lamps and firepits | 0 | Material-specific damage channels, reset, blast effects without inventing route destruction |
| MP8 Rat's Nest / R176 section 6 | Suppression | No mission action/health controllers; three AI submaps and 23-second script result hold | 0 | Floor-specific spawns, roofs/ledges/camera, source sound gaps and ordinary combat |
| MP9 Bitter Jungle / R173 section 7 | Demolition | Shared bomb; high-threshold shack/depot and 17 crates; unused `tntcount` writers do not establish another objective | 4 | Separate bomb-result destruction from C4/RPG, final geometry and PKMs |
| MP10 Blood Lake / R175 section 5.2 | Extraction | Three hostages, no mission action/health controllers; one Safety extraction region on submap 0 | 3 | NPC starts/routes, rescue/death/penalty and LMG/PKM/MGL behavior |
| MP11 Death Trap / R175 section 5.3 | Extraction | Three hostages; two lever-controlled moving gates that can also be destroyed | 3 | Gate motion/destruction interaction, NPC rerouting, authored local-X sliding motion and PKMs |
| MP12 The Ruins / R173 section 8 | Demolition | Shared bomb; damage-controlled antennas/tower | 0 | Small health/shield thresholds, structure state, bomb spawn and both plant sites |
| MP51 Vigilance / R176 section 7 | Suppression | Five live access barriers, four doors; both factions explicitly receive C4 availability; 23-second hold | 4 | Five independent opened routes, RPG/C4 eligibility, doors, PKMs and reset |
| MP52 The Mixer / R175 section 5.5 | Escort | Three VIPs; 30-second staging delay then zone conversion; no mission actions; stray Demolition templates are not its mode | 3 | Upper-submap Safety versus same XZ below, two MGLs/PKM, staging latch and final extraction |
| MP53 Foxhunt / R175 section 5.6 | Escort | Three VIPs; 30-second staging delay; no mission actions | 3 | Multiple Safety regions, leader loss, correct timeout winner, PKMs and final extraction |
| MP61 Sujo / R174 section 4 | Breach | SEAL bomb objective; six access barriers, two distinct airstrikes with structural/ladder effects | 3 | Whiskey/Foxtrot timelines, already-destroyed targets, bomb restrictions, thermal PKMs |
| MP62 Enowapi / R174 section 5 | Breach | Two destructible moving gates, three gate levers, light wire-cut action, two airstrikes | 3 | Gate +35 Y movement, light scope, Echo wall change versus Delta blast, turret-prefix ambiguity |
| MP64 Shadow Falls / R176 section 8 | Suppression | Nine mission health templates have no placed roots; 27 torches plus insects/water/rain; 21-second hold | 3 | Thermal PKMs and cave/terrain/visibility; do not spawn template barriers or infer fire damage |
| MP71 Fish Hook / R175 section 5.4 | Extraction | Three hostages; six doors, four breakable windows, three access barriers and three HP0 plank callbacks; two real rescue regions | 2 | Region union, plank trigger versus C4, glass isolation, barrier/door/NPC paths and PKMs |
| MP72 Crossroads / R171, R173 section 10 | Demolition | Shared bomb plus two independent upstairs detonators; rubble closes each underpass | 2 | Fish Market/Red Room label captures, alternate routes, asymmetric PKM/LMG, plant versus bridge state |
| MP73 Sandstorm / R174 section 6 | Breach | Three access barriers, distinct plank, radio/transformer/tower chain, AA gun/glass, seven doors, repeatable Terrorist helicopter attacks | 3 | Radio destruction disables calls, multi-track strikes, weapon thresholds, MGL/thermal PKMs |
| MP81 Chain Reaction / R176 section 9 | Suppression | Three crane translation pause/resume controls; two doors; independent sway/audio; 23-second hold | 0 | Three motion phases, moving collision, contact policy, no invented turret from unplaced template |
| MP82 Guidance / R175 section 5.7 | Escort | Three VIPs; 20-second staging; nine doors, three placed access barriers plus orphan access3, one-use SEAL strike changes ladder/wall | 3 | Safety2 initial behavior, strike at 18/20 seconds, NPC ladder interruption, PKMs |
| MP83 Requiem / R173 section 9 | Demolition | Shared bomb, five doors, two access barriers; both factions explicitly receive C4 availability | 2 | Layered plant/spawn heights, local openings versus full route, thermal PKM/LMG |

The current source counts are not a gameplay completeness metric. MZANIM health count includes base controllers and unplaced templates; a single common program may instantiate on several panes. All 22 common CZANIM libraries were parsed and contain zero health blocks, closing that separate health-controller search. Mounted weapons remain independent of that negative result.

## 4. What is missing and how feasible it is

| Shared work | Maps affected | Feasibility and main dependency |
|---|---|---|
| Demolition objective | Six | Strong source/data support. Needs carried item, sustained interaction/placement, fuse/defuse, scoring, reset, mode-specific resolution and replication. |
| Breach objective | Three | Reuses bomb lifecycle with distinct SEAL pickup/plant and defense policy. Map barriers are separate from the objective. |
| Extraction objective/NPCs | Four | Rules/entities/regions available. Navigation, follow/stop, damage/credit, rescued/dead states and replicated identity are substantial missing systems. |
| Escort objective/NPCs | Three | Reuses NPC infrastructure but adds staging latches, delay and zone-kind transitions. It must not be reduced to Extraction with a different message. |
| Mutable environment / scene damage | Across all modes | Assets and many callbacks available. Needs per-instance health, activation and transform state that every collision/render consumer shares. |
| Gates and cranes | Death Trap, Enowapi, Chain Reaction | Authored motion exists. Translation decoding, pause/resume, moving bounds, actor contact and historical geometry are required. |
| Scripted strikes | Sujo, Enowapi, Sandstorm, Guidance | Timelines, weapons, aircraft and structural targets are present. Server schedules damage once; clients reconstruct remaining visual/audio events. |
| Mounted weapons | 43 placements / 15 maps | Definitions, weapon types and parts resolved. Needs mount ownership, aim/camera, firing, thermal, release and object lifecycle. |
| Per-map Suppression policy | Six | Relatively small after rule metadata; avoid globalizing the 21/23-second result-hold variants or overriding owner countdown/solo rulings. |

The core bottleneck is shared simulation state. Current movement caches, mutable collision-owner sharing between rooms, incomplete effect decoding, player-only explosion damage paths and event-only action behavior cannot safely support these mechanics independently. The concrete code anchors and risks are in R171 sections 9-10, R174's implementation section, R175 section 7, R176 section 10 and R177 sections 4-6.

A complete generic mission VM is not the prerequisite. Typed objective policies and a verified subset of environment operations can cover the identified content. Each unsupported command on a **reachable** gameplay path needs an explicit implementation or evidence gate. Ambient-only commands and dead templates should not block unrelated functional milestones, nor be silently counted as reproduced.

## 5. Consequential rule distinctions

- **Bridge explosions and the objective bomb are independent.** Weapon names reused by effects do not imply consuming the objective item. Ordinary blast damage may still kill the carrier and drop it.
- **Plant hold, placement animation and equipment cooldown differ.** Static reading gives five seconds plus 2.25 seconds to commit a plant, a separate three-second inventory cooldown, five seconds to defuse and a 30-second fuse. Capture gates remain; do not advertise a console-measured 7.25 seconds.
- **Mode scripts differ.** Crossroads starts elimination watching at 13 seconds; Suppression and all three Breach maps do so at 15. Breach starts watching pre-plant timeout at five seconds and awards it to Terrorists. Planted bomb state stops ordinary elimination/timeout paths. Escort timeout awards SEALs; it is not Suppression's draw.
- **Extraction is not simply “two enter a zone.”** Scripts count all three resolved outcomes, distinguish team-attributed kills, and apply a SEAL penalty. Host penalty processing subtracts 60 seconds with a one-second floor; coalesced increments and same-tick rescue/death need source/runtime closure.
- **Escort has two stages.** Mixer/Foxhunt wait 30 seconds and Guidance 20 after the staging condition, then convert zones for final extraction. Submap identity is part of zone membership; a matching XZ on the floor below is not sufficient.
- **Damage eligibility is not an action-type guess.** The recovered health layout and shield thresholds distinguish C4-eligible access barriers, HP0 callbacks, ordinary bullet/glass damage and high-threshold bomb-result buildings. Falloff, occlusion and damage delivery remain necessary after a nominal weapon threshold passes.
- **Motion is more than a visible animation.** Enowapi gates move vertically, Death Trap gates slide along authored local X, and Chain Reaction hooks translate horizontally and keep swaying when translation pauses. Every world query must agree on the current state/phase.
- **Names and shared libraries are insufficient.** Preserve animation ordinal and instance ancestry, case-sensitive turret prefix order, source team masks and exact model parts. Repeated short names and unused templates otherwise create false map features.

## 6. Validation status and closure ledger

This wave produced reproducible local source inventories for all 22 maps and primary executable traces for the missing interfaces. Geometry probes measured both Crossroads underpass blockages; two Requiem barrier openings at three heights each; 12 Breach barrier/plank openings; five Vigilance openings; and three Frostfire pane apertures. These are bounded line-segment measurements using the current geometry library. They do not prove a standing/crouching capsule fits, that all alternate paths remain playable, or that actor contact during motion matches the original.

Independent reviewers checked Demolition, Breach, NPC-mode, Suppression and turret findings. Review corrections include source-function citation fixes, explicit C4 availability, proper translation vectors, precise common-library scope, and separating mounted weapons from action-list absence. Source-only claims remain marked as such even after peer review.

Repository validation: `npx tsc --noEmit -p tools` passes; `npx vitest run tools/test/corpus.test.ts tools/test/docs.test.ts --maxWorkers=2` passes all 17 tests. The rebuilt corpus contains 29 notes, 482 numbered sections and 96 records, including a lookup record for every retail map. All 79 local file links across the seven new research notes and two plans resolve. The final all-map inventory returns 22 distinct archives with the expected 6/3/4/3/6 mode split; these checks validate the research artifacts, not the planned gameplay.

| Gate | Required evidence before parity claim | Owner in plan |
|---|---|---|
| Objective races and presentation | Timestamped original traces for plant/timeout/defuse/elimination, NPC death/rescue and stage completion | MAP-01, MAP-04, MAP-08 |
| Capsule route changes | Actor paths before/after each barrier/bridge; stairs/railings, frames, alternate route; screenshots plus collision assertions | MAP-02, MAP-06, per-map row |
| Moving-world contact | Gate closing/destruction mid-motion; crane pushing/riding/crushing only if evidenced; ladder removed under an actor | MAP-07 |
| NPC behavior/navigation | Follow/stop context, team/reach/follower limits, floor/link/door/water rules and lost-leader behavior on actual map routes | MAP-08 |
| Aircraft/damage sequencing | Exact blast nodes/weapons, team/one-use gates, destruction and already-destroyed target attribution | MAP-09 |
| Turret runtime | Each weapon type, thermal, all aim bounds, ammo, mount/dismount/death and exclusive ownership | MAP-10 |
| Network lifecycle | Two clients plus spectator, join/rejoin at each persistent/transition state, room isolation, stale messages and next-round reset | MAP-03, MAP-11 |
| Presentation and input | Source prompt/audio/models, controller semantic actions, mobile touch equivalents, contextual priority/cancellation | MAP-11 |

The plan includes concrete tests and source-gate tasks. None of these owed captures is concealed behind a “complete map” badge. Existing deliberate owner differences and earlier launch-page work are preserved.

## 7. HDD maps: pending data, explicitly excluded from source-complete count

| Map | Reported SOCOM II mode | Current status | Work when locally available |
|---|---|---|---|
| After Hours | Suppression | HDD archive unavailable; no source/runtime audit claimed | Identify revision and hash, inspect all reader/AI/scene/effect/controller paths, then run the same mode/environment/turret/collision review |
| Liberation | Escort | HDD archive unavailable; no source/runtime audit claimed | Resolve NPCs/regions/staging independently; do not copy another Escort map's delays, then full environment audit |
| Last Bastion | Breach | HDD archive unavailable; no source/runtime audit claimed | Resolve bomb/barrier/strike/weapon placement independently, then full source and route audit |

These three remain MAP-12 pending. Their names do not justify assigning invented archive IDs, asset counts or implementation estimates. No additional confirmation is required to finish the 22 available maps' research; lack of HDD data is a bounded coverage limitation, not a reason to stop the retail audit.
