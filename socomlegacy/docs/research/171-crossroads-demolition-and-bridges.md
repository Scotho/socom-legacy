# 171 -- Crossroads: Demolition and the two bridge switches

Filed 2026-10-04 from the old-layout checkout (`$WT`, the clone's pre-restructure web project), where it was the uncommitted note 96 (WT-96 in the research wave of 2026-10-04, [178](178-the-research-wave-of-2026-10-04.md)); renumbered 171, the cross-references to its sibling notes 171-177 and its plans renumbered with it. Status: reading, pending review.

Research date: 2026-10-04. Scope: feasibility and evidence for the two missing Crossroads systems, not an implementation claim. The implementation owner is the [Crossroads plan](../plans/2026-10-04-crossroads-demolition-and-bridges.md), tracked under MATCH-03.

## 1. Findings and evidence standard

Crossroads (`MP72`) has **one shared Demolition bomb and two independent environmental bridge switches**. Each bridge has authored intact and destroyed geometry, collision, debris and animation. Destroyed rubble closes the street underneath it; a measured segment through each street is clear in the intact state and intersects rubble in the destroyed state. This is feasible with the available assets. Complete player movement and original-console parity remain unverified.

Demolition is also recoverable: the executable contains a dedicated replicated `CZBombState`, and MP72 contains its objective script, two plant actions, bomb spawn marker, messages and base-destruction presentation. Today the web room still applies Suppression rules to Crossroads. These are two new gameplay systems sharing mutable-world, interaction and synchronization work.

Three research lanes covered bridge assets/scripts/collision, bomb rules/decompilation, and current architecture. A second pass checked input lifecycle and conflicting assumptions. Evidence labels here mean:

| Label | What was actually done |
|---|---|
| **Measured** | Parsed the local disc with repository tools or ran a stated geometry probe. This proves the measurement, not console behavior. |
| **Read** | Traced executable/script semantics; runtime parity is still owed. Corpus records use `reading` for these conclusions. |
| **Reported** | Contemporary guide or manual corroboration; does not establish engine timing or collision semantics. |
| **Proposed** | Architecture and tests for the web port, not recovered original behavior. |

`D:Lnnn` below refers to `C:/projects/socom_pc/game/analysis/socom2_game.elf.decomp.c`, inspected locally. Disc references are members of `MP72.ZDB` unless stated otherwise. Decompiled bodies and extracted assets are not copied into this repository.

## 2. Sources and earlier corpus leads

| Source | Contribution |
|---|---|
| [Research 72](72-mp-map-archive-anatomy.md), [75](75-aimaps-mps.md) | Archive anatomy and named AIMAPS points. |
| [Research 89](89-effects.md), [92](92-doors.md) | zAnim/effect execution, action selection, valves, geometry movement and replication precedents. |
| [Research 91](91-the-round.md), especially sections 19 and 20 | Current Suppression round rules, explicit missing objective modes, and shared offline/server Room. |
| [Research 94](94-the-arsenal.md) | `MPBOMB` item 154 is outside normal loadout selection; ordinary C4 and the claymore detonator are separate systems. |
| Desktop research 45 (`desktop@be55783:docs/research/45-positional-and-bridge-names.md:236`); 55 (`desktop@be55783:docs/research/55-class-inventory.md:327`) | Recovered `HandleBombStateRequest__11CZBombStateFiUcP6CPnt3D`, address `0x002c1f10`, and class inventory. |
| `READERM.ZAR/actions.rdr`, `MZANIM.ZAR`, `MP72_GEO.ZED`, `AIMAPS.MPS`, `READERC.ZAR/mp72LOC.rdr` | Map-specific actions, scene state, collision, objective sequences, spawn point and localized messages. |

The author's [GameFAQs online-play guide](https://gamefaqs.gamespot.com/ps2/914813-socom-ii-us-navy-seals/faqs/32202) identifies upstairs detonators in Fish Market and Red Room. Its route description sends players under a bridge toward the Terrorist base when intact, but via stairs and a railing jump after destruction. It recommends defensive bridge destruction and includes custom rules forbidding switch use. These passages were retrieved from search-index excerpts; direct page access was blocked. They corroborate route significance and community names, but do **not** yet tie each name to a particular scene subtree.

The official SOCOM II USA manual, printed page 33 (PDF page 35), describes obtaining the bomb, taking it to the enemy base and preventing a defuse until detonation. The page was inspected in the manual itself (*SOCOM II: U.S. Navy SEALs* instruction manual, SCUS-97275, Sony Computer Entertainment America, 2003). It does not supply the timing used below. SOCOM 3 manuals and SOCOM 1 guides were excluded as gameplay authorities.

## 3. Exact action and scene bindings [measured]

`READERM.ZAR/actions.rdr` contains these separate records:

| Action node | Type | Valve | Animation | Authored reach |
|---|---|---|---|---|
| `seal_callstrike_1` | `SWITCH` | `seal_strike1` | `seal_demo_site1` | 30 |
| `terrorist_callstrike_1` | `SWITCH` | `terrorist_strike1` | `terrorist_demo_site1` | 30 |
| `terrorist_tent` | `MPBOMB` | `mp_bombAA` | `BombPlace` | horizontal 15, elevation 15 |
| `seal_tent` | `MPBOMB` | `mp_bombBB` | `BombPlace` | horizontal 15, elevation 15 |

Switch records specify the lever prompt and `points 2`; bomb records specify the bomb action prompt. The switch records contain no shared-bomb prerequisite, team key, elevation override or explicit `one_shot` key. `FUN_002b49f0` (D:L157059) initializes an unrestricted team mask; the action-record loader `FUN_002b4f40` (D:L157236-157431) permits overrides. The absent elevation defaults to -1. Generic action netlog paths `FUN_002bb5b0` (D:L160627-160646) / `FUN_002bb310` (D:L160545-160568) award the two points once, guarded by +0x3f bit 1. `FUN_002b5510` resets this flag each round. This is a code reading, not a runtime score capture.

Terminology correction to earlier action notes: `FUN_002b4230` parses `EXECUTE_ACTION`; `FUN_002b4f40` loads `actions.rdr` records.

Stable bridge identities should follow the data, not an unverified building-name mapping:

| Identity | Scene root | Switch world position (x, y, z) |
|---|---|---|
| `seal_demo_1` | `worldmodel/seal_demo_1/arch=arch` | `(1094.49, 100.27, 1831.16)` |
| `terrorist_demo_1` | `worldmodel/terrorist_demo_1/arch=arch` | `(1298.43, 99.25, 1174.33)` |

Each arch has `healthy`, `destroyed` and `parts` subtrees. Each has 54 healthy and 170 destroyed collision polygons. Separate instance paths matter even where the model geometry is shared.

The destroyed collision consists of eight polygons at `/destroyed` and 162 at `/destroyed/dia`; debris parts have visuals but no collision. Parent activation must reach those child owners. `buildScene.ts` currently flattens paths without propagating the parent's active bit.

The Terrorist switch collision bounds are `(1318.963,89.250,1171.174)` to `(1328.963,109.250,1181.174)`, displaced about 25 units from its node origin. An origin-radius interaction is therefore wrong even before considering floors. `FUN_005aa240` (D:L463856-463901) and `FUN_005aa470` use the aimed collision node/ancestors and horizontal reach to the hit point, with the optional elevation gate. Use those semantics for the switches.

Plant action origins are `worldmodel/terrorist_tent = (526.023376, 13.812000, 1523.773315)` and `worldmodel/seal_tent = (2018.594849, 63.187206, 1422.437012)`. `AIMAPS.MPS` gives `StartBomb` in submap 0, cell `(95,112)`, world XZ `(1279.761902,1446.111115)`. The all-map follow-up [R173](173-demolition-map-audit.md) traces quantized AI-cell height through `FUN_00516940` and `FUN_0051afe0`; the existing named-point parser alone does not expose it. Exact final bomb grounding, slope handling and model placement still require validation.

Plant factions are directly traced: `FUN_002ac410` (D:L152198-152201) resolves `seal_tent` to `DAT_00437dcc` and `terrorist_tent` to `DAT_00437dd0`; `FUN_00594480` (D:L452755-452759) permits Terrorists at the former and SEALs at the latter.

## 4. Bridge initialization, activation and reset [read, data]

The scene's raw node flags alone are insufficient: both healthy and destroyed groups have active flags before zAnim initialization. The `MZANIM.ZAR` node references carry the initialization/reset instructions:

| Node reference | First word | Relevant meaning |
|---|---|---|
| `destroyed` | `0x90080900` | Set inactive, preserve resulting active state for restoration. |
| `parts` | `0x90080a00` | Set inactive, preserve resulting active state. |
| `healthy` | `0x10080b00` | Preserve active state. |
| `part_1` through `part_15` | `0xbc08xx00` | Inactive initially; preserve active/parent/transform state. |
| switch reference | `0x10000100` | Preserve its initial active state. |

Retail `FUN_0026b5e0` (D:L115740-115750) applies the inactive bit before saving active state. `FUN_0026b430` (D:L115690-115721) restores saved active/parent/transform state; `FUN_0026c4f0` restores saved references. Round reset `FUN_002ac0e0` (D:L151976-151991) calls that restoration and `FUN_002b5510`, resetting action valves/use counters. reCOM's `zanim.h` lines 417-435 supplies corroborating flag names: bit 31 set-inactive, bit 28 save-active, bits 26/27/29 save translation/rotation/parent. Retail code, rather than SOCOM 1 behavior alone, supports this reading.

Each `*_demo_site1` program has concurrent sequences. These offsets are relative to that program's `Seq_Data`:

| Offset | Authored operation |
|---|---|
| 28, 72, 84 | `FIRE_WEAPON` at `damage_point2`, wait 0.1 seconds, then fire at `damage_point`. |
| 156, 188, 220 | Two `fire_explode_med` effects (first offset upward 30) and `dust_explode_long`. |
| 240, 248, 256 | Activate destroyed, activate parts, deactivate healthy. |
| 264 | Invoke the corresponding callstrike program; it hides only that switch. |
| 284-332 | Iterate parts, reparent to world, activate and invoke `flyparts`. |
| 340 onward | Two `.EXP_1` then three `.EXP_DISTANT` sounds, separated by waits 0.15, 0.5, 0.7 and 0.9 seconds. |

The effects sequence swaps geometry immediately, while the damage sequence emits twice 0.1 seconds apart. Do not postpone collision until the sound tail ends. `flyparts` starts authored object motion; a separate sequence waits two seconds, fades opacity over two seconds, deactivates debris and restores opacity for reuse. Captures are still needed for visual/frame parity.

The blasts reuse `MPBOMB` weapon 154 and `MPBOMB Ammo` ammo 19 **as damage definitions**, without using, consuming or moving the shared objective bomb. `RUN/ZWEAPON.ZAR/zweapon.rdr` supplies raw explosion damage 50 and radius 30, but the commands also carry float overrides 0.001 and 0.01. `FUN_0025ccb0` (D:L107197-107316) resolves weapon/ammo, reads the damage-node position and applies those overrides to projectile fields +0x8c/+0x90. Effective unit conversion, falloff, occlusion, attribution and friendly fire remain untraced; do not implement this as an assumed 50-damage, 30-unit blast.

One use per round follows removal of the switch target and refusal while an animation runs (`FUN_002b44e0`), not an authored `one_shot` flag. The bridge programs contain no `VALVE` write: generic nonzero-valve replay (`FUN_002b4440`) does not by itself prove original bridge late-join reconstruction. Full web snapshots are a proposed requirement, with original join behavior still owed.

## 5. Street-route geometry experiment [measured]

The [reproducible probe](../../tools/probe-crossroads.ts) uses `parseSceneGraph`, `worldCollision`, `collisionOwners`, `buildGrid` and `segmentHits`. It toggles owner active bits for the authored bridge state and ignores `SURFACE_SKIP` polygons. The same archive supplies all geometry; there are no guessed rectangular blockers.

At y = 54 game units:

| Bridge | Street segment, start to end | Intact | Destroyed |
|---|---|---|---|
| `seal_demo_1` | `(812.408,54,1488.049)` to `(932.408,54,1488.049)` | 0 hits | 4 rubble hits; first x = 851.434 |
| `terrorist_demo_1` | `(1615.044,54,1403.012)` to `(1735.044,54,1403.012)` | 0 hits | 4 rubble hits; first x = 1654.069 |

The scratch exploration also found four hits at y = 44, 49 and 59; two at 64; none at 69. This measures a street barrier with a finite height. It does **not** establish player-capsule blockage, all approach directions, jumping over rubble, the upstairs path, or the safety of actors occupying the bridge at collapse. Those require movement tests and original captures.

Run from `socomlegacy/`, with a locally supplied disc fixture:

```powershell
npx tsx tools/probe-crossroads.ts
```

The probe prints bindings, initialization references and route measurements. The archive and manual remain in ignored fixture storage. Promote the selected route measurements into collision tests during implementation; do not classify complete gameplay as proven from these segments.

## 6. Shared bomb state and interaction [read]

`FUN_002c26e0` (D:L164244) registers the separate `BombState` object, size `0x14`. `FUN_002c1f10` (D:L164008-164039) handles these original states:

| State | Meaning | Valid outgoing transition read in the handler |
|---|---|---|
| 0 | Uninitialized/reset | Setup creates state 1. |
| 1 | On ground | 2: pickup. |
| 2 | Carried | 1: carrier drops; 3: carrier plants. |
| 3 | Planted | 4: defused; 5: host fuse expiry. |
| 4 | Defused | Round resolution/reset. |
| 5 | Detonated | Round resolution/reset. |

`FUN_002c1a80` initializes the bomb at `StartBomb`; `FUN_002c1970` tears it down. `FUN_002c20c0` (D:L164056-164099) packs XYZ at +0x00, carrier/planter actor ID at +0x0c, defuser actor ID at +0x0e and state at +0x10. `bomb_owner` is a **team value** (1 SEAL, 2 Terrorist), changed to the defuser's team in state 4. A new model should retain explicit actor IDs and planting team instead of conflating team and carrier.

`FUN_002c2090` delegates state requests to `FUN_002b9910` (D:L159455); `FUN_002b9a00` receives them. Original requests contain XYZ, actor ID and desired state. `FUN_002c2450` and `FUN_002c2590` rebuild remote state. The original transition handler is not a sufficient modern authority boundary: the web server must validate range, team, hold duration and phase, not accept a client-declared completed plant.

| Behavior | Source and reading |
|---|---|
| Automatic pickup within 20 units | `FUN_00593da0`, D:L452602 -> `FUN_005aa110`, D:L463792 -> `FUN_00547570` -> `FUN_0059def0`; item type `0xb`, squared distance less than 400. |
| Plant eligibility | `FUN_00594350` / `FUN_00594480`, D:L452694 onward: alive, carrying item `0x9a`, valid opposing site, time remaining and compatible actor/equipment state. |
| Plant and defuse hold | `FUN_00594cf0` D:L453249-453287 (*was* cited `FUN_00594600` D:L453260-453294): five-second counter (`0x40a00000`), reset on release; `FUN_005920c0`, D:L451484 decrements and commits below zero. |
| Actual plant commit | `FUN_005c0020` -> `FUN_005be9a0`, D:L475479-475488 sets inventory +0x87c to 2.25 seconds and separate cooldown +0x81c to 3 seconds. `FUN_005c1970`, D:L476883-476886 decrements the placement timer; D:L477003-477010 probes ground and calls `FUN_005bc730` to request state 3. Approximately 7.25 seconds total is a static inference, not measured parity. Do not add the separate three-second cooldown. |
| Defuse completion | `FUN_005920c0`, D:L451507-451522 calls `FUN_0059da80` directly once the hold counter is below zero; it requests state 4 without that placement stage. |
| Defuse team and reach | D:L452436-452454 uses opposing `bomb_owner`; D:L452589-452598 compares horizontal 15 and vertical 20, verified ELF floats `DAT_00650688` / `DAT_00650690`. |
| Manual drop and pickup cooldown | `FUN_0059dd30` at D:L452153; four-second cooldown. Automatic pickup also sets the cooldown at D:L452610. |
| Death drop | `FUN_00547af0`, D:L413112 -> `FUN_0059dd30`, D:L457560. |
| Grounded dropped model | `FUN_0059ddb0` removes item `0x9a`, projects the dropped model to ground and hides the satchel. |
| Carrier disconnect | `FUN_002bef60`, D:L162527 preserves position; D:L161037 later calls `FUN_002c1bf0` to recreate the bomb. |
| Satchel presentation | `FUN_005bbf10` / `FUN_005bc200`; existing web `bodyView.ts` has a gear-visibility hook. |
| Fuse | `FUN_002c2260`, D:L164131 sets 30 seconds; `mp72LOC.rdr` ID 7210 independently corroborates it. |

Manual drop is action 6 / mask `0x40`: `FUN_005937c0` (D:L452458-452473) requires the carried bomb, eligible actor/cooldown state, no movement input and downward aim (actor +0x1450 below -0.25). Plant/defuse use action 7; normal switch/door interactions use action 13. C4 is separately item `0x97`, mask `0x40000` (D:L452030-452057). Do not bind every contextual action to one undifferentiated equipment operation.

Plant and defuse award two points through `FUN_005455d0` (D:L411594) and `FUN_00545650` (D:L411618). Successful demolition adds two through `FUN_00545750` (D:L411655). Team accounting reaches `FUN_00544d60`. Persistent-stat labels and duplicate-award prevention need verification before connecting account statistics.

## 7. Crossroads round rules differ from Suppression [read, data]

MP72's `objectives` animation contains 344 commands. Offsets below are relative to its decoded command stream, not the whole archive:

| Sequence | Offset | Relevant behavior |
|---|---|---|
| `game_over` | 0 | Max/half-round logic; ties can require additional rounds. |
| `start` | 236 | Wait 3 seconds, objective message, wait 10 seconds, then elimination checks: 13-second grace. |
| `defuse` | 1960 | State 4 awards the defuser's team. |
| `mission_timer` | 3756 | Wait 15 seconds, watch normal timer; expiry aborts and stops elimination sequence. |
| `switch_timer` | 3844 | On planted state 3, stops **both** `start` and `mission_timer`; starts fuse/defuse handling. |
| `bomb_drop` | 4204 | Drop announcements. |
| `bomb_pickup` | 4344 | Pickup announcements. |
| `bomb_timer` | 4596 | State 5 awards planting team. |
| `abort` | 6488 | Round count advances, winner 99, mission timeout. |
| `success` | 6572 | Winning result sequence. |
| `failure` | 6664 | Losing result sequence. |

**A planted bomb survives elimination as the deciding objective.** Killing the planting team's last player does not resolve the round, and the normal round timer cannot override the running fuse. Research 91's Suppression elimination grace and resolver must not silently remain active on Crossroads.

Before planting, `start` tests the three perspective-specific `aiteam_08 == 0` branches before any `aiteam_00 == 0` branch. Simultaneous empty teams therefore favor SEALs in this script reading. Elimination versus timeout in the same scheduler frame is still unresolved. The web's intentional solo-loopback empty-team exception remains a separate owner rule.

Defuse has a three-second announcement delay; detonation has two two-second message delays. Success/failure then waits 20 seconds, advances round count, checks match completion, waits one second and raises the mission result. These are script readings; they must be reconciled with existing intermission presentation before implementation, not added twice to a generic room delay. Same-tick outcomes remain an explicit capture gate.

The current effects decoder omits embedded `WHILE` predicates and valve operand-reference flags. In `game_over`, an operand value of 4 can refer to `mp_round_count`, not literal 4. Executing this decoder as a general objective VM would silently change rules. A small typed Demolition state machine with cited parameters is the proposed scope.

## 8. Presentation is available, with wiring still owed

`READERC.ZAR/mp72LOC.rdr` IDs 7200-7213 contain objective, pickup, drop, plant, fuse, defuse and demolition messages. Mission programs reference `MUS_BOMB_PU`, `MUS_BOMB_PLANTED`, faction intros/wins and announcers. Existing HUD assets include bomb/drop prompts, `ret_bomb.tif` and the executable's defuse-timer messages. Character strings identify pistol/nonpistol defuse begin/loop/end animations.

`FUN_002c1c30` (D:L163920 onward) invokes `base_explosion1` with context type 3 and the actual world bomb node (`DAT_0044d4a0`), then hides that node. That program has one `FIRE_WEAPON` command using the MPBOMB damage definitions and no static node references. The blast follows the placed bomb. `destroy_terrorist_base` and `destroy_seal_base` swap healthy base geometry for `whats_left`/parts and effects. These are **base** presentation paths; they must not activate either bridge. The damage-controller linkage from bomb blast to base destruction still needs tracing.

The blast's path to a **body** is read (2026-10-16, BOMB-DAMAGE; research 332, reading, pending review): the
FIRE_WEAPON's MPBOMB round goes off on every machine, online too (the pool round's `PostTick` `FUN_003c9fb0` and
`HandleTimers` `FUN_003c99a0`, through `+4` bit 4), and its explosion hurts the players in MPBOMB Ammo's 30 (300 u)
by the grenade's body path; each console's round is owned by its own SEAL, so a bomb death is the victim's own. The
bridges' two FIRE_WEAPONs and `destroy_terrorist_base`'s take the same path (research 332 §2; not built).

## 9. Current implementation gaps and reusable foundations

All code paths below are relative to `packages/`. Anchors describe the 2026-10-04 working tree.

| Area | Existing foundation | Required change / risk |
|---|---|---|
| Map loading | `viewer/src/mapActions.ts:11-61`, `doors.ts:74-90` | Generic actions discard valve/animation/elevation/access; door parsing keeps more but filters `DOOR`. Add typed bridge and objective metadata in both `loadMap.ts` and `simMap.ts`. |
| Render activation | `world.ts:674-748` moves individual scene paths/instances | `setAlternate` is a global debug reveal. Add per-path subtree visibility, including individual instanced placements. |
| Initial bridge state | `loadMap.ts:1001-1034` alternate-name filtering | Names hide some parts/remains but miss `destroyed`. Both authored states can currently be loaded together; apply zAnim initial reference flags. |
| Collision activation | `scene/src/grid.ts:42,210`, `probe.ts:70`, `ray.ts:116`, `segment.ts:108` honor owner flags | `viewer/src/mover.ts:1730-1772` caches walls without the same active-owner gate. Rendering or flags alone cannot fix movement. |
| Other geometry consumers | `traversal.ts:347`, server projectile/blast code | Audit ladder/ledge caches, floor, camera, bullets, grenades and blast visibility for state changes. |
| Room isolation | `match/src/server.ts:115-122` forks door point buffers | Owners remain shared; no-door maps can be returned wholesale. Mutable owner state must be private to every room. Loopback already copies owners. |
| Effects | `effectData.ts:95-106`, `effectRunner.ts`, `effects.ts:647-659` | Mission programs are loaded, but `FIRE_WEAPON`, `FOR_CHILDREN`, `OBJECT_MAKE_WORLDCHILD`, `END_FOR_CHILDREN` and debris opacity lack required semantics. Current `active` changes an effect object, not world render/collision state. |
| Interactions | Door selector, HUD icons, keyboard/controller/touch Action | `main.ts:225` chains doors/C4 before traversal; introduce common arbitration and authoritative begin/cancel/complete semantics. |
| Protocol | `net/protocol.ts`, `net/codec.ts:167-198`, `match/src/room.ts:2218` | No environment/bomb state. Codec rejects trailing bytes; bump version and coordinate client/server. |
| Lifecycle | `room.ts:2084` round serial and projectile reset | Reset bridge geometry, action valves, debris and bomb before spawning; support late join, watchers and reconnects. |
| Objective policy | `net/rules.ts`, `room.ts:1945`; `mapOrder.ts:18` already labels Crossroads | Current rooms use Suppression. Add objective type separately from `Rules = classic/respawn`; preserve current classic-only ruling. |
| Rewind | `room.ts:1405-1421` rewinds actors only | Choose and test collision revision policy for shots crossing a bridge transition. |

The action-release edge is an additional hazard: `traversalPage.ts:119-144` activates on release, while a held lane exists through `walk.ts:276` / `sim.ts`. `touch.ts:358-367` currently treats pointer cancellation/lost capture like ordinary release. A plant/defuse controller must distinguish cancellation from intentional release and clear pending actions on blur, menu entry, death and disconnect. A cancelled touch must not activate a switch.

## 10. Remaining evidence gates and ownership

| Question | Next experiment / source | Owner in plan |
|---|---|---|
| Which canonical bridge is Fish Market versus Red Room? | Match switch coordinates, scene landmarks and original overhead/first-person captures. Until then use authored IDs internally. | XR-01 |
| Exact collapse ordering, damage weapon values, attachment context | Decode remaining bridge gameplay opcodes, trace handlers in retail; capture both switches and occupants. | XR-01, XR-04 |
| Full street closure and slower alternate route | Capsule sweeps/walks through all four bridge combinations; stairs/railing route in original and web. | XR-03, XR-08 |
| Plant commit/cancel timing beyond the five-second hold | Capture button-down, release, movement/aim loss, damage/death, animation event and state 3. | XR-01, XR-05 |
| Plant versus timeout; defuse versus fuse on one tick | Controlled clock/input traces and explicit deterministic authority policy, labelled where still a reading. | XR-05, XR-08 |
| Dropped/planted bomb exact floor/model transform and cooldown ownership | Probe placement and trace pickup/drop with two actors, death and disconnect. | XR-05 |
| Base explosion and scoring semantics | Trace damage-controller bindings and stat calls; verify once-only team/actor awards. | XR-06 |
| Original late-join/reset presentation | Join before, during and after each transition; capture next-round restoration. | XR-07, XR-08 |

No new gameplay constants or parity claims are introduced by this research. Source-backed readings are sufficient to design the work; unresolved behavior must remain explicitly tracked instead of acquiring silent defaults. The companion plan defines implementation tasks and acceptance gates.
