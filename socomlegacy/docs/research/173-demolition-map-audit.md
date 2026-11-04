# 173 — Retail Demolition maps: objective, environment and implementation audit

Filed 2026-10-04 from the old-layout checkout (`$WT`, the clone's pre-restructure web project), where it was the uncommitted note 98 (WT-98 in the research wave of 2026-10-04, [178](178-the-research-wave-of-2026-10-04.md)); renumbered 173, the cross-references to its sibling notes 171-177 and its plans renumbered with it. Status: reading, pending review.

Date: 2026-10-04. Scope: Blizzard (MP1), Night Stalker (MP7), Bitter Jungle (MP9), The Ruins (MP12), Requiem (MP83), with Crossroads (MP72) as the already researched comparison. This is research and an implementation plan; no gameplay changes are made here.

The six maps use the same carried-bomb objective, but they are not interchangeable environments. Requiem adds two C4 barriers that either faction can attack; Blizzard has six doors, two destructible outhouses and three glass windows; Night Stalker has 22 additional damage-controlled props; The Ruins has two destructible communications structures. Bitter Jungle has high-threshold building and crate destruction, apparently associated with the final objective blast. Crossroads' two bridge switches remain separate from the bomb and ordinary C4. Eight mounted weapons are placed across Bitter Jungle, Crossroads and Requiem. Reuse the objective state machine while retaining these map-specific bindings and trigger rules.

## 1. Evidence, scope and reproduction

Labels used below:

- **[data]** decoded archive bytes and scene placements.
- **[read]** executable/decompilation or existing source implementation; not a console observation.
- **[measured]** a probe run against the supplied retail archives and current geometry code.
- **[inference]** a conclusion supported by the preceding evidence but still requiring the named runtime check.
- **[proposal]** implementation or validation work, not a recovered original behavior.

`D:L…` means a line in the locally supplied `C:/projects/socom_pc/game/analysis/socom2_game.elf.decomp.c`. Function addresses are the stable anchors. The ELF is `C:/projects/socom_pc/game/disc/socom2_game.elf`. [Research 171](171-crossroads-demolition-and-bridges.md) contains the detailed bomb/network trace and Crossroads bridge route probes. [Research 92](92-doors.md), [94](94-the-arsenal.md), [75](75-aimaps-mps.md) and [89](89-effects.md) supply the existing door, equipment, navigation and effect context; source claims in those notes are not assumed to cover every newly inspected map. [Research 174](174-breach-map-audit.md) records the parallel health/damage trace.

The audit tool is [probe-demolition-maps.ts](../../tools/probe-demolition-maps.ts). It reads metadata directly without extracting or modifying archives:

```powershell
npx tsx tools/probe-demolition-maps.ts --programs
npx tsx tools/probe-demolition-maps.ts MP83 --animation access --barrier-probes
npx tsx tools/dump-effects.ts MP83 access1 destroy_access1 --mission
npx tsc --noEmit -p tools
```

Use `--run <local RUN directory>` to supply another legally available extraction. Large local reports belong in ignored `test-fixtures/research`, not the tracked corpus. The probe retains animation ordinals: duplicate animation names are real. Its `placements` are global exact-name candidates, and `rootScopedCandidates` restrict these to the animation root. Neither is a complete emulation of the native context/parent/search resolver. No unplaced root is counted as a live map feature. `health.offset` and `sequenceDataOffset` are relative to the ZAR data area; add `Zar.dataOffset` for a byte offset in the whole ZAR (`health.offsetInZar` is already absolute within that member). Sequence/command offsets below are relative to that animation's `Seq_Data`.

The effect decoder omits embedded `WHILE` predicates and valve operand-reference flags, and filters `QUAD_ALIGN`. It must not be used as a complete objective interpreter, or have its operation indices blindly paired with unfiltered raw commands. Precise command offsets cited here were inspected from the raw command dump. Script comparisons below concern decoded control structures, followed by the native/runtime qualifications explicitly listed.

| Archive | Bytes | SHA-256 |
|---|---:|---|
| MP1 | 9,084,928 | `6829bd96bb56fd4efa8df1898c5084599373ca55db13b20eeca0796cf8862823` |
| MP7 | 9,512,960 | `9156e7a8c28147815232c18c644e1ca8d9966eb3f964ecc32894151b3e59f02b` |
| MP9 | 11,038,720 | `3680b6c9896d17651b93a3842aba11c79b20069523489d5d4b7a6e7db190af1e` |
| MP12 | 9,826,304 | `14124254fd0634f24f97e824902fbed5a163b0fd18b514578e7377ae2edd43c2` |
| MP72 | 11,612,160 | `f5d22b9aab83bee1d37181e372347f0fe2367e36b076b95559b2df79c72005cd` |
| MP83 | 12,156,928 | `cf4f92a5f08f641bc98ca2f74245a9bfc25bf13f2e31cace9294047ed0ed81ab` |

Key outer ZDB member offsets, decimal:

| Map | READERM.ZAR | Map GEO.ZED | AIMAPS.MPS | MZANIM.ZAR |
|---|---:|---:|---:|---:|
| MP1 | 6,144 | 3,805,184 | 8,404,992 | 8,781,824 |
| MP7 | 6,144 | 4,313,088 | 8,914,944 | 9,191,424 |
| MP9 | 6,144 | 4,370,432 | 10,440,704 | 10,711,040 |
| MP12 | 6,144 | 4,145,152 | 9,164,800 | 9,523,200 |
| MP72 | 6,144 | 4,661,248 | 10,958,848 | 11,317,248 |
| MP83 | 6,144 | 4,065,280 | 11,235,328 | 11,857,920 |

## 2. Mode, objective placements and map settings [data]

Mode authority is `READERC.ZAR/missionlist.rdr`, not the web picker. Its nested records pair `NAME`, `NUMBER`, `TYPE`, and `MULTIPLAYER`; all six have `TYPE DEMOLITION`. `READERM.ZAR/mission.rdr` independently supplies the expected display names. The native mode value is **2**; Breach is **1**, not 3 (`FUN_002a6c50`, D:L149170, bomb setup branch; mode parsing `FUN_002c9540`).

Every map has exactly two authored plant actions: `terrorist_tent` and `seal_tent`, type `MPBOMB`, animation `BombPlace`, range **15**, elevation **15**, and `action_MP_bomb.tif`. Native faction mapping is direct: `FUN_002ac410` (D:L152198–152201) resolves `seal_tent` to `DAT_00437dcc`, `terrorist_tent` to `DAT_00437dd0`; `FUN_00594480` (D:L452755–452759) allows Terrorists at the former and SEALs at the latter. Do not infer ownership from a nearby model's `s_`/`t_` name.

Coordinates are original world units, rounded to three decimals; ten units are approximately one metre. They are action-node origins, not guaranteed legal capsule standing positions.

| Map | SEALs plant at `terrorist_tent` XYZ | Terrorists plant at `seal_tent` XYZ | Valve suffixes, same order |
|---|---|---|---|
| MP1 | 1424.841, 97.405, 1398.699 | 2311.255, 262.167, 3264.675 | AA / BB |
| MP7 | 2466.834, 90, 1563.711 | 713.385, 103, 1595.882 | CC / DD |
| MP9 | 2848.662, 4.5, 684.133 | 1073.968, 17.132, 1395.578 | XX / ZZ |
| MP12 | 590.564, 104, 2020.593 | 2134.010, 104.6, 2047.821 | EE / FF |
| MP72 | 526.023, 13.812, 1523.773 | 2018.595, 63.187, 1422.437 | AA / BB |
| MP83 | 1375.341, 87, 757.516 | 1123.766, 116, 2574.368 | XX / ZZ |

The prefix is `mp_bomb`. MP83's SEAL-site action has two stored polygons and a local vertical extent of 20; the other listed plant nodes each have one polygon. A flat-radius-only implementation would discard authored elevation and multi-surface behavior.

| Map | Bomb point spelling | AI submap / cell X,Z | Cell-centre world X,Z | AI submaps |
|---|---|---|---|---|
| MP1 | `StartBomb` | 0 BaseMap / 142,146 | 1830.918, 2378.793 | BaseMap, Dredge1, Dredge2 |
| MP7 | `StartBomb` | 0 Unknown / 110,96 | 1636.029, 2079.980 | Unknown, roof |
| MP9 | `StartBomb` | 0 Unknown / 134,60 | 2013.667, 1139.658 | Unknown |
| MP12 | `startBomb` | 0 Unknown / 117,111 | 1359.762, 1346.111 | three Unknown submaps |
| MP72 | `StartBomb` | 0 ground / 95,112 | 1279.762, 1446.111 | ground, floor1 |
| MP83 | `startbomb` | **1 Cats / 57,30** | 1219.762, 1606.111 | base, Cats, tunnels |

All six have 96 spawn records including twins; this is not a claim of 96 player slots. Named-point counts are 9/9/10/10/8/10 respectively. None of their AI named-zone tables contains a zone. MP12 has one inter-submap link at each of two ends; the other five have no such links. MP83's bomb belongs to `Cats`, whose vertical bounds are approximately -7.920 to 81.971, while `base` spans 38 to 399.922 and `tunnels` 83 to 96.371. Preserve the named point's submap; a highest-floor lookup can place the bomb on the wrong level.

### Newly traced AI height encoding [read, data]

`FUN_002c1a80` (D:L163839) asks `FUN_0052db70` for `StartBomb`, then `FUN_0052d480` converts its AI location to XYZ. The latter computes the cell centre (D:L396924 onward) and calls `FUN_00516940` (D:L385086). That reads:

`Y = submap.minY + submap.heightStep * ((cellWord >> 9) & 1023)`.

`FUN_0051afe0` sets `heightStep = (maxY - minY) / 1024` after loading versions 0x13–0x17 (D:L387628). Generated retail recomp independently exposes the bit extraction as `dsll32 13` then `dsrl32 22` at0x51694c/0x516950 and the exact float constant0x3a800000 (1/1024) at0x51b0fc. The converter can then apply an additional surface/slope correction through `FUN_00516920`, `FUN_00530d10`, `FUN_00519130`, `FUN_005168e0`; that branch is not emulated here. This narrows the older research statement that AI data contains no height: the point record has no XYZ, but its referenced cell has a quantized height. Do not change the generic spawn implementation solely from this new static reading.

| Map | Bomb cell word | Quantized Y before optional correction |
|---|---|---:|
| MP1 | `0x80c30c41` | 122.045 |
| MP7 | `0x80614641` | 51.979 |
| MP9 | `0x80c07641` | 4.900 |
| MP12 | `0x82609441` | 56.338 |
| MP72 | `0x83c1fe41` | 47.334 |
| MP83 | `0x80000041` | -7.920 |

All six bomb-cell low bytes are 0x41, so the `FUN_00516920` bit-7 test appears clear on these cells. Confirm the runtime cell representation and emitted bomb XYZ before declaring these the final original coordinates. Cross-check against collision without replacing the submap or point semantics.

### Equipment and environment are map-specific

`mission.rdr/Valves` uses the existing equipment mask: 1 SEALs, 8 Terrorists, 9 both, 0 disabled. Requiem's **Enable_c4=9** makes C4 selectable by both factions; it is 0 on the other five. It is not a forced Breach loadout. `Enable_satchel=0` throughout; the carried objective remains item 154 rather than a selected satchel or C4.

| Map | SEAL rifle grenade carriers | Terrorist M79/MGL | RPG | LAW | Night / default material |
|---|---|---|---|---|---|
| MP1 | enabled | disabled | Terrorists | disabled | yes / SNOW |
| MP7 | disabled | enabled | disabled | SEALs | yes / SAND |
| MP9 | disabled | disabled | disabled | disabled | no / GRASS |
| MP12 | enabled | disabled | Terrorists | disabled | no / STONE |
| MP72 | enabled | disabled | Terrorists | disabled | no / ASPHALT |
| MP83 | enabled | enabled | disabled | disabled | yes / SNOW |

Use the actual mission masks, including ammo valves, rather than this abbreviated table as an armory implementation. In MP7 the 203 ammo valves are 8 despite SEAL carriers being disabled; a generic weapon-family shortcut would misread them. MP83 has 203 ammo mask 9 and GL ammo mask 8.

World-root texture scrolling is present in MP7 (`ripple_water`, dv .3), MP9 (`09_water`, `water`, dv .03), MP12 (sky du .02 and three water nodes du .18); absent in MP1/72/83. All six `dyntex.rdr` files contain only boundary values (usually .25/.62; MP1 .25/.5; MP12 .24/.605), not a discovered power-switch graph. Night/lighting/fog and cold breath/rain/fire/sky programs affect presentation and visibility; do not reinterpret them as objective actions.

### Mounted weapons are a separate controller family [data, read]

`READERC.ZAR/ai_turrets.rdr/TURRET` defines mounted weapons independently of `actions.rdr`, `vehicles.rdr` and zAnim health blocks. Native loader `FUN_003aaa90` (D:L301346–301412), called during mission setup at D:L152669, populates definitions. Scene walker `FUN_003a9780` matches through `FUN_003aac40` (D:L301416–301445) using a **case-sensitive prefix of the definition's length, first match**, then constructs `CTurret` through `FUN_003aa350`. Exact-name lookup alone misses suffixed instances.

| Map / placed root | XYZ | Matching definition / weapon | Authored yaw / pitch limits |
|---|---|---|---|
| MP9 `mp9_turret01` | 1245.318,18.154,1381.434 | mp9_turret / PKM TURRET | -30..30 / -20..45 |
| MP9 `mp9_turret02` | 1080.925,18.857,1214.788 | same | same |
| MP9 `mp9_turret03` | 2587.778,19.214,666.377 | same | same |
| MP9 `mp9_turret04` | 2793.574,18.550,880.273 | same | same |
| MP72 `mp72_turret01` | 600.394,56.188,1595.459 | mp72_turret01 / PKM TURRET | -10..110 / -45..35 |
| MP72 `mp72_turret02` | 2129.683,112.5,1462.799 | mp72_turret02 / LMG TURRET | -70..70 / -45..45 |
| MP83 `mp83_turret_pkm01` | 1613.917,169.867,798.443 | mp83_turret_pkm / PKM TURRET | -60..60 / -45..45 |
| MP83 `mp83_turret_lmg01` | 965.019,157.867,2504.012 | mp83_turret_lmg / LMG TURRET | -60..60 / -45..45 |

These definitions specify MANUAL, health30, mount-angle35, yaw/pitch rates1.5, parts `turret/gun/firepoint`, ammo7.62x54R and team30. MP9 explicitly specifies mount range25; MP72/83 use the native default22. MP83 definitions also contain THERMAL. Team30 and health30 are authored turret parameters, not automatically the same masks/scales as inventory/player health. [R177's all-map mounted-weapon audit](177-emplaced-weapons-audit.md) records the native mounting checks and scopes the shared occupancy, aim, firing, damage and replication work; source parameters alone do not establish functioning turrets in the web build.

The all-map audit, independently reproduced with every embedded GEO library joined, resolves no manual-turret placement in MP1/7/12 and exactly one of each required part beneath each of this table's eight roots. These are source bindings; runtime construction and operation still need the R177 acceptance checks. The roots are independent of their child `RMG_turret`/`LMG_turret` model names and must not be double-counted. Per-map tests must include mount/dismount from both factions, contested occupancy, yaw/pitch limits, death/disconnect release and interaction priority while carrying the bomb. Preserve MP9's mounted weapons even though its handheld launcher equipment is disabled.

## 3. Shared Demolition runtime and script differences

The shared native subsystem is `CZBombState`, independently of environmental action valves. [R171 sections 6–8](171-crossroads-demolition-and-bridges.md#6-shared-bomb-state-and-interaction-read) give the full trace; the following is the implementation contract reused for all six.

| State | Meaning | Read transition guard |
|---:|---|---|
| 0 | reset/uninitialized | initialization resolves `StartBomb`, creates state 1 |
| 1 | on ground | valid actor may pick up |
| 2 | carried | current owner may drop or plant |
| 3 | planted | eligible opponent may defuse; host fuse may expire |
| 4 | defused | round result belongs to defuser's team |
| 5 | detonated | result belongs to planting team |

`FUN_002c1f10` (D:L164008), `FUN_002c20c0` (D:L164056), and registration `FUN_002c26e0` (D:L164244) define the original state requests and 0x14-byte snapshot: XYZ, owner/planter actor ID, defuser actor ID, and state. `bomb_owner` is a team valve (1 SEALs, 2 Terrorists), overwritten with defuser team in state 4; retain an explicit planting team in the web model. Validate phase, ownership, team, position and server hold time rather than trusting the original permissive request handler.

Recovered shared timings/reach [read]: pickup horizontal distance below 20 (`FUN_005aa110`, D:L463792); plant action range/elevation 15/15 [data]; defuse horizontal/vertical 15/20 (ELF floats at `0x650688`/`0x650690`, D:L452589); hold counters 5 seconds (D:L453260–453294); defuse commits below zero directly; plant additionally enters `FUN_005be9a0`'s 2.25-second equipment placement delay (D:L475479–475488, `FUN_005c1970` D:L476883/L477003). Thus 7.25 seconds is a static nominal plant path, not a stopwatch measurement. Release/interruption/animation timing needs runtime parity. Fuse default is 30 seconds (`FUN_002c2260`, D:L164131).

Death and disconnect drop the bomb; manual drop is a separate contextual action 6 with downward aim, no movement input and a four-second repick cooldown (D:L452458, L457560, L162527). Plant/defuse use action 7, ordinary doors/switches action 13, ordinary C4 item 0x97 a different equipment action. Plant +2, defuse +2 and successful Demolition +2 are separate native score paths (`FUN_005455d0`, `FUN_00545650`, `FUN_00545750`, D:L411594–411655). No persistent-stat award should be wired until duplicate/replay handling is verified.

### Objective program comparison [data, read]

| Group | Raw commands | `Seq_Data` offset in ZAR data area | Difference |
|---|---:|---|---|
| MP1 / MP7 / MP9 / MP12 | 333 each | 0x1c0 / 0x1c0 / 0x140 / 0x140 | Same decoded control structure; music RUS / ALG / BRA / BRA |
| MP72 | 344 | 0x140 | Six additional `STOP_SEQUENCE start` operations in defuse branches; five extra repeated announcer calls in detonation branches |
| MP83 | 339 | 0x140 | Six extra repeated announcer calls; spectator presentation branch differs; same faction winner assignments |

The first four share these sequence starts: `game_over` 0, `start` 236, `defuse` 1960, `mission_timer` 3708, `switch_timer` 3796, `bomb_drop` 4156, `bomb_pickup` 4296, `bomb_timer` 4548, `abort` 6280, `success` 6364, `failure` 6456. MP72's differing offsets are tabulated in R171. MP83 retains the common offsets through `bomb_timer`, then uses `abort` 6472, `success` 6556, `failure` 6648.

All six start with waits of 3 and 10 seconds before elimination checks: a 13-second grace. All six elimination branches wait 2 seconds before success/failure. Those terminal sequences wait 20 seconds, advance round count/check match end, wait 1 second and emit the mission result: nominal **23 seconds after elimination**, not a mode-independent hard-coded delay. Defuse branches wait 3 seconds before the terminal sequence (24 total); detonation branches contain two waits of 2 seconds (25 total). The four older maps present the defuse result message before the 3-second wait; MP72/83 after it. These are script timing sums, not a measurement of UI disappearance or native room teardown.

MP83's spectator branch for `bomb_owner=2` in defuse calls `failure`, while the other five call `success`; authoritative `mp_winner=8` is unchanged. Record this as a perspective/presentation discrepancy, not a new team rule. Do not deduplicate extra announcer calls without testing original playback suppression.

Before planting, all six test the Terrorist-empty `aiteam_08` cases before SEAL-empty `aiteam_00`, which gives SEAL priority for simultaneous empty teams in this script reading. `mission_timer` waits 15 seconds before watching the normal timer; pre-plant expiry reaches abort/winner 99. On `mp_bomb=3`, `switch_timer` stops **both elimination and the normal timer**. A planted bomb remains decisive even if all attackers die. Timeout versus elimination in the same scheduler frame, plant on the last frame, fuse/defuse same-tick priority and solo-loopback exceptions remain explicit policy/capture gates.

`game_over` uses valve-reference operands for round limits and score comparisons; literal interpretation of decoded values 4/5/7/9 is wrong. Reuse the raw/native comparison already traced in R171 and do not implement a general objective VM from `decodeEffectProgram`.

### Base destruction [data, read]

All six have `base_explosion1`: a single `FIRE_WEAPON` at command offset 28, MPBOMB Ammo / MPBOMB, with float overrides .001 and .01. `FUN_002c1c30` supplies the actual planted bomb node as context, so the explosion follows its placement. All twelve `destroy_*_base` animations have HP2, armor0, shield21, bound to their `basedi` reference. They reject C4's raw damage18 in the eligibility function. The blast-to-damage-interface path, attenuation/occlusion and final geometry timing still require the common damage work; do not replace it with an unrelated bridge switch or global destroy-all call.

Stored healthy/remains/debris subtree polygon counts are: MP1 Terrorist15/15/0, SEAL36/12/0; MP7 35/24/0 and46/12/0; MP9 15/15/0 and23/23/0; MP12 4/4/0 each; MP72 77/30/0 and28/15/0; MP83 9/10/0 and56/5/0. These counts describe authored states, not all concurrently active collision.

## 4. Shared environmental damage/reset contract [read]

The 24-byte `Anim_Health` block is now decoded alongside the Breach audit: node-ref index u8 at +0, current/max HP f32 +4/+8, current/max armor +12/+16, shield/threshold +20. `FUN_002740e0` (D:L121150/L121195–121208) constructs the node's damage interface; `FUN_00273960` (D:L120884) and `FUN_00273ee0` (D:L121071) restore health. C4 eligibility `FUN_002739b0` requires positive HP and shield <= incoming C4 damage. General damage `FUN_003c7490` (D:L318596–318640) applies the threshold and health/armor update; `FUN_00273a50` (D:L120978–121059) starts the bound animation on death.

An HP0 block can still act as a delivered-hit trigger: the callback tests resulting HP <= 0, without requiring old HP positive, except for a separate conditional recovery/authority branch. HP0 therefore means no C4 planting eligibility, not universally inert. Animation flags 0x2b's bit3 must not be labelled explosive-only: the Breach trace ties it to network handling and projectile authority. Threshold and available equipment determine the supported trigger; runtime hit delivery/replication is a remaining gate.

Initial variants are controlled by high bits of **`ZAnimNodeRef.word`**, not its separately stored `flags` field and not scene flags alone. Bit31 deactivates before bit28 saves active state (`FUN_0026b5e0`, D:L115740). Bits26/27/29 save transforms/parent; restoration is `FUN_0026b430`, `FUN_0026c4f0`, called by round reset `FUN_002ac0e0` (D:L151976). This matters for every map below: geometry exports can contain both active-looking healthy and destroyed nodes before animation initialization.

The same runtime must restore door transforms, disabled roots, materials/lights and detached debris, along with action valves and health. A renderer-only visibility toggle does not disable the mover's cached walls, and a collision-only toggle leaves phantom visible barriers. Full snapshots of final world state are a web requirement even where original event replay behavior remains uncertain.

## 5. Blizzard — MP1

**Inventory [data]:** eight actions (six doors plus two bomb sites), 88 mission animations / 1,345 raw commands, seven health animations, all seven roots placed. `CZANIM.ZAR` has 288 common animations and no health blocks. `vehicles.rdr` contains one disabled player record, not an authored drivable vehicle.

The six `door_outhouse1..6` actions use `singleDoor`, range30. [R92](92-doors.md) already recovers its one-second animation and the reusable door network/collider path. Positions/polygon counts:

| Door | XYZ | Stored polygons |
|---|---|---:|
| 1 | 2602.733,245.663,3152.146 | 5 |
| 2 | 1954.931,85.307,1237.344 | 5 |
| 3 | 2344.906,273.050,3288.200 | 8 |
| 4 | 2277.739,273.050,3239.328 | 8 |
| 5 | 1434.340,108.418,1430.168 | 5 |
| 6 | 1533.809,108.425,1406.298 | 5 |

Two live outhouse destruction controllers are independent of those six door actions:

- `outhouse1`, health data offset0x4b60, HP1/shield10, root `(2623.027,234.808,3170.774)`; `outhouse2`, offset0x4e60, same HP/shield, root `(1973.274,74.464,1216.973)`. Each stores57 polygons; the damage receiver is child `hitthecan` (28 polygons), not the entire root indiscriminately.
- Each 20-command sequence calls its corresponding `outhousedoor1/2`, turns `hitthecan`/`vishealthy` off, `toilet` on, fires `C4 Ammo`/`c4` at command72 using the toilet node, then calls fifteen flying-part effects. The named `outhousedoor1/2` sequence disables the corresponding door root at command28. The other four one-command door-removal templates are present, but have no additional live outhouse health controller in this inventory.
- `toilet` reference word0x90080500 makes it initially inactive and saved for reset. Healthy collision/visual references save active state. Blowing the outhouse must remove the door from both interaction and collision; a subsequent door packet must not reopen or re-enable it.
- C4 is disabled in the mission armory. This secondary effect's use of the C4 damage definition does not mean the player must carry or plant C4 to trigger it.

Three `snow_window01..03` roots each own two polygons. Their health blocks at0x4410/0x4540/0x4670 have HP0/shield0; sequences at0x4480/0x45b0/0x46e0 play glass break, run `DESTRUCTION_SOURCE`, then deactivate context node -7. Node-ref word0x10000100 preserves the initial active state. They are plausible hit-triggered breakable windows under the callback above; verify delivered bullets and reset, rather than filtering them out as dead HP0 targets. Their shared parent pivot `(2313.659,253.167,3269.964)` is not three distinct window centres.

Additional authored atmosphere: snow fall, cold breath, inside/outside wind, lens programs. Stale `valves.rdr` names such as generator/other doors have no matching live use action in this audit; they do not establish a usable generator mechanic.

**Plan/tests [proposal]:** retain six existing doors; add two damage-bound outhouse state groups and three glass groups after the common damage/reset work. Test door1/2 open and closed before destruction, a late door command after destruction, simultaneous damage, secondary blast attribution, glass hit on each separate pane, join after destruction and next-round restoration. Validate snow/inside audio and NVG on the night map independently of the objective.

## 6. Night Stalker — MP7

**Inventory [data]:** two bomb actions and no additional authored use action; 117 mission animations /1,532 commands; 24 placed health controllers, including the two bases. This is not evidence of a static environment. Common CZANIM again has288 animations/no health blocks.

| Damage group | Root(s) / position examples | HP / shield | Program consequence |
|---|---|---|---|
| Firepit and three sticks | firepit `(2471.565,87.561,1641.224)`; stick1..3 nearby | 1 /0 | Stop flame, particles, motion; source flags0x33 |
| Spinner and dish | spinner_ant `(784.868,130.029,1606.832)`; dishnetwork `(705.675,127.332,1682.180)` | .1 /0 | Stop/invalidate spin, metal sound, move, fade/deactivate after2s |
| Antenna bases | ant_base1 `(784.681,102.971,1606.765)`, ant_base2 `(703.131,100.110,1673.946)` | 1 /9 | good off, parts on, five debris calls; calls spinner hit |
| Tables | sealtable1 `(731.842,103,1577.729)`, sealtable2 `(679.587,103,1587.427)` | 1 /9 | good off, parts on, five debris calls, destroy lamp |
| Six gun crates | guncrate1..6 near Terrorist site, X2400–2446/Y90–95/Z1546–1591 | 1 /9 | good/top off, parts on, five flying parts, wood sound |
| Three decorative guns | gun1..3 near X2404–2416/Y90–94/Z1566–1598 | 1 /9 | damage target `ak_di`, motion, fade after1.5s |
| Two crate tops | crate_top1 `(2401.727,93.668,1558.835)`, crate_top2 `(2418.832,93.381,1592.605)` | 1 /9 | motion and fade after2s |
| Lamp | lamp `(686.510,114.5,1585.994)` | 1 /0 | invalidate, lamp_light/lightsource off, motion, lamp_good off, particles |

Health data offsets identify these groups: firepit0x4220; sticks0x4430/4710/49f0; spinner0x5bc0; dish0x5d90; antennas0x60d0/6260; tables0x69b0/6b40; crates0x7090–7950 in steps0x1c0; guns0x8650/8820/89f0; crate tops0x8bc0/8d90; lamp0x8f60. Root counts respectively: firepit1 polygon, each stick3, spinner4, dish8, antenna9 each, table5 each, crates5/5/11/11/11/11, guns6 each, tops6 each, lamp9.

The file contains zero-command initialization entries and damage entries with the same names `ant_base1/2` and `sealtable1/2`. Preserve both; a `Map<animationName,animation>` can discard reset metadata. Both antenna base damage programs call `spinner_hit`; do not silently rewrite the second to `dishnetwork_hit` because the names suggest that pairing. Resolve actual source context and compare native behavior first. Likewise both tables call `destroy_lamp`: a single placed lamp may be affected by either.

The guns are **damage-reactive props**, not evidence of extra weapon pickups. The lamp is a local light change, not proof of a map-wide power switch. `water_drain`, fire glow and interior/exterior noise are ambient programs.

**Plan/tests [proposal]:** port damage bindings and hierarchical state once, then register these22 prop controllers. Prioritize props that remove cover or light; debris flight can follow without delaying authoritative collision. Test one hit above/below shield, stacked crate independence, duplicated animation-name handling, antenna/spinner stop, direct lamp damage versus either table damage, late-join light state and reset. Preserve weapon-mask asymmetry (SEAL LAW versus Terrorist grenade launchers) in the bomb/prop damage test setup.

## 7. Bitter Jungle — MP9

**Inventory [data]:** two bomb actions;117 mission animations /1,606 commands;21 placed health controllers including the two bases; no extra use action. All nineteen non-base controllers have **HP1/shield45**. C4 and all listed launcher/rocket carriers are disabled by this mission's armory.

| Controller | Data anchors | World bounds / collision states |
|---|---|---|
| `big_shack_destroy` | health0x3e70, Seq_Data0x3fd0, damage ref `di_1` | root AABB `(968.812,-1.118,1253.954)` to `(1228.472,198.828,1511.363)`; shack_good186 polygons, shack_leftover189, parts0 |
| `ammo_depot_destroy` | health0x4350, Seq_Data0x44b0, damage ref `di` | AABB `(2709.310,4.5,548.426)` to `(2969.389,70.579,807.089)`; depot_good241, depot_leftover218, parts39 |
| Eight `gcrate_destroy` objects | roots gcrate1..8; health0x4830–4fa0 step0x110 | Each5 stored polygons; good off, parts on, one flying-part call |
| Nine `bbox_destroy` objects | roots bbox1..9; health0x75b0–7e30 step0x110 | Each10 stored polygons; same four-command pattern |

Both building sequences have23 commands: healthy group off, parts and leftover on, twenty debris calls. Their `*_parts` and `*_leftover` references0x90080500/0x90080600 initialize inactive; `*_good`0x10080400 saves active state. The common root origin `(640,0,320)` is an exporter pivot, not the building location. Use transformed bounds/geometry for hit and blast placement.

The two building bounds surround the two corresponding plant locations. Their shield45 exceeds C4 damage18, while MPBOMB's raw explosion rating is50. **[inference]** These controllers are consistent with the final Demolition blast destroying the base buildings and nearby containers. This does not prove all are reached by the effective blast: command overrides, falloff, occlusion, damage-receiver subnodes and actual bomb location still matter. Do not expose two new manual demolition switches, or assume ordinary rifle damage can clear these structures during a round.

All seventeen container programs increment `tntcount` (VALVE operation12, operand1), but no decoded mission animation reads it and it is absent from this map's `valves.rdr` declarations. The building programs have no such counter predicate. No additional TNT-count objective or cascade threshold is established. Retain this as a native valve-binding question rather than inventing a mechanic from the name.

**Plan/tests [proposal]:** implement the common bomb first and capture each site's original blast/structural result. Then wire shield45 receivers, correctly scoped duplicate `gcrate_destroy`/`bbox_destroy` programs and remaining collision. Test bomb at both extremes of legal plant range, each structure's debris without cross-triggering the opposite base, visibility/ground under collapsed roofs, round reset and join during result presentation. Below-threshold damage must not initiate these animations. Ordinary player capsules should not collide with an inactive leftover or with flying parts already removed from the authoritative cover state.

## 8. The Ruins — MP12

**Inventory [data]:** two bomb actions;91 mission animations /1,310 commands; four placed health controllers including bases. Two extra communications targets each have HP.2/shield12:

- `ant_base1`, health0x5370 /Seq_Data0x5430, at `worldmodel/s_tower/ant_base1`, `(596,104,2010)`, nine polygons. It removes the healthy base, enables parts, calls `spinner_hit` and five part flights. `spinner_hit` is a triggered program with no independent health block on this map.
- `tower_hitme`, health0x5680 /Seq_Data0x5750, at `worldmodel/t_tower/terror_tower/comtower2=comtower2/tow_deux`, `(2144.131,104.047,2053.887)`, thirteen stored polygons. It sets `towervalve=1`, turns `di1`, `di3`, `partnull` off, turns `di2` on, launches three parts and invalidates its animation. `di1`/`di3` have4 polygons each; `di2` has5 and initial-inactive ref0x90080700. Thus the final collision is a shorter surviving base, not the entire tower disappearing.

The `s_tower` model lies at the Terrorist plant site, and `t_tower` at the SEAL plant site. The action names/native site mapping decide factions. `towervalve` is written but has no decoded reader or `valves.rdr` declaration in this map. There is no established airstrike/radio objective merely because a tower breaks.

Rain, additional raindrop programs, wind, sky motion and water scrolling are authored. Two copies of some inside/outside-noise programs are present; avoid name-only replacement of animation records. AI submap link data exists and should survive loader changes.

**Plan/tests [proposal]:** add two damage controllers with their separate fragments/state changes; retain no-C4 armory. Test damage above/below12, spinning antenna stop, tower collision from8 initially active polygons to5 base polygons (stored total13 is not initial13), native faction/base association, break before bomb planting and full reset. Compare rain/lighting and long sightline fog independently from objective correctness.

## 9. Requiem — MP83

**Inventory [data]:** nine actions: two bomb sites, five doors, two type-less destruction actions.87 mission animations /1,309 commands;11 health blocks, but only4 roots placed (two bases and two barriers). Seven templates are unplaced: access3..6 and plankaccess1..3. The latter also have HP0 and cannot offer C4 planting. Do not create seven additional barriers from the library.

### Two independent C4 barriers [data, measured]

| Barrier | Root / action origin XYZ | Health | Bounds |
|---|---|---|---|
| access1 | 1497.202,91.582,1593.755 | HP1, armor0, shield17; health0x36b0 | X1486.029–1508.381, Y82–104.654, Z1593.120–1594.352 |
| access2 | 938.981,91.578,1646.244 | same; health0x3780 | X927.801–950.154, Y81.996–104.650, Z1645.648–1646.879 |

Damage binds to `di_good`, not the zero-sized `access_action1/2` marker. Each root stores26 polygons: healthy `good_parts`20 (18 under `di_good`), `whats_left`6, flying `bad_parts`0. The supplied damage rating18 can pass threshold17, and `mission.rdr Enable_c4=9` permits **either team** to select C4. The exact range/placement and original damage replay remain common runtime questions.

Health programs `access1/2` have flag0x2b and one command:87 at28, name-index3 = `set_access1/2`. These bind to action records `access_action1/2`, valve `set_access1/2`, animation `destroy_access1/2`, points2. Missing `type` does not mean SWITCH: native default is8/UNKNOWN, with default range32. The action record's own interface does not accept C4; the damage interface does (R94 C5.1).

`destroy_access1/2` first guard their context valve at0, invoke `access_destroy`, then set context valve1. In sequence `access_destroy` at84, command112 disables `good_parts`,120 disables `di_good`,128 enables `whats_left`. A `skip_effects==0` guard then enables debris, iterates children, makes them world children, calls `access_part_fly` and plays wood sound. The permanent state swap is outside that effects guard, so replay without debris must still open the barrier. References `whats_left`0x90080600 and `bad_parts`0x90080800 initialize inactive and save state; healthy refs save active state.

Full-map collision measurements, applying only these two barriers' authored healthy/remains states and skipping SURFACE_SKIP polygons:

| Barrier | Segment X / Z endpoints | Y samples | Intact / destroyed hits |
|---|---|---|---|
| access1 | X1497.202, Z1581.755→1605.755 | 90,94,100 | 4→0 for every sample |
| access2 | X938.981, Z1634.244→1658.244 | 89.996,93.996,99.996 | 4→0 for every sample |

All intact hits belong to that barrier's healthy groups. These prove openings on six centreline segments, **not** capsule traversal, lateral clearance, alternate-route timing or original network parity. The probe is reproducible with `--barrier-probes`. Unlike Crossroads' route-closing bridge rubble, these swaps remove a central barrier and leave its frame.

### Doors and layered objective placement

Five doors, each5 polygons and range30: hq_door1 `(1245.208,144,2697)` uses `singledoor_right`; hq_door2 `(1064.207,144,2545)`, ware_door1 `(1483.999,103.003,807.001)`, ware_door2 `(1285.999,103.003,807.001)`, ware_door3 `(1413.999,159.002,634.002)` use `singledoor_left`. All also author `kick_Door`; R92's implementation runs the first animation, not the kick variant. Treat kick as separately scoped parity work, not as a missing door-opening primitive.

`net_000.rdr` contains only `playerStart` and `backstart`, no edges/routes. It does not replace `AIMAPS.MPS/Cats/startbomb` or establish an extra NPC task. The bomb's low submap, upper warehouse door and two-surface SEAL plant node make this the strongest layered-map regression case.

**Plan/tests [proposal]:** after common Demolition, port both barriers with server damage/health state and points-once action dispatch. Test C4 from both factions; two simultaneous charges; duplicate action delivery; destroying one gate leaves the other intact; snapshots with skip-effects preserve the opening; collision/visibility/camera/bullets agree; door movement next to barriers; all eleven runtime objects reset (five doors, two barriers, two base states, bomb and round state). Validate bomb spawn on Cats rather than the upper floor and plant/defuse reach across vertical separation. Kick parity requires a separate clip/action trace.

## 10. Crossroads comparison — MP72

The independent bridge mechanisms and their complete plan remain in [R171](171-crossroads-demolition-and-bridges.md) and its linked implementation plan. They are the only additional use actions in MP72's four-action set;77 mission animations /1,286 commands; only the two bases have `Anim_Health`. A missing bridge health block is expected because switches, not carried explosives or bullet damage, start their map-state programs. C4 is disabled here.

Reuse objective rules and mutable-state foundations across all six maps, but do not generalize Crossroads' rubble-blocks-road outcome to Requiem's opens-a-barrier result, Blizzard's destroyed cover, or Bitter Jungle's final bomb presentation. MP72 remains the pilot for bridge-specific alternate-route/capsule/late-join tests, not the only acceptance map for Demolition.

## 11. Feasibility and staged implementation [proposal]

The needed meshes, authored state swaps, objective sites, bomb points, animations, messages and most trigger parameters exist locally. The largest engineering work is shared authoritative objective state and mutable collision/render state, followed by faithful damage/action dispatch. Additional modelling is not the first blocker.

1. **Resolve the bounded native gates below and create typed source metadata.** Read mode from missionlist, plant node/elevation, named AI point including submap/height, animation identity/health/reference reset flags and explicit action bindings. Keep arbitrary original scripts outside shipped source. Fail a map audit when a required live binding cannot resolve; report unplaced library templates without turning them into objects.
2. **Implement shared server Demolition and client presentation.** Ground/carried/planted/defused/detonated states, carrier ownership, drop/death/disconnect, server holds/fuse, pre-plant versus planted round rules, correct team sites, score-once events, versioned snapshots and reset. Reuse R171 MATCH-03 sequencing. Make interaction precedence explicit for bomb, C4, doors and switches and expose equivalent controller/mobile operations.
3. **Implement general mutable-world state.** Per-instance subtree visibility and collision activation, mover cache invalidation, camera/ray/bullet agreement, health/armor reset, reversible transforms/parents, lights and active action targets. Use deterministic state snapshots; effects can be transient but final state cannot depend on receiving an animation event at the right time.
4. **Prioritize route and cover features.** Crossroads bridges and Requiem barriers first; Blizzard doors/destruction/glass; The Ruins' antennas; Night Stalker's cover/light props. Existing DOOR support supplies eleven door actions here; add destruction conflict handling and separately schedule authored kick parity. Reject stale client door/charge events after their target is gone. Include the shared mounted-weapon task for MP9's four, MP72's two and MP83's two placements; carrying a bomb must not bypass mount/occupancy restrictions.
5. **Complete bomb-result/environmental presentation.** Correctly scoped base effects, Bitter Jungle buildings/containers, sounds/messages and debris. Static persistent collision must finish correctly even if effects are skipped. Review mutable lights, texture-scroll and weather parity without inventing additional objectives from ambient scripts.
6. **Run per-map multiplayer acceptance.** Both factions, both sites, pickup/drop/death/disconnect, one carrier at a time, interruption and last-frame transitions; all destroyed states and reset; a joining client; a packet duplication/reordering case; server/headless and page agree. Controller/mobile input must deliver the same intent, not separate rules.

Current source gaps [read, 2026-10-04 tree]: `packages/scene/src/zanim.ts:106` exposes health length only; the audit probe decodes it without changing runtime. `packages/viewer/src/equipment.ts:136` selects C4 targets from type-less action markers and does not implement native health eligibility. `packages/match/src/room.ts:1827` blast processing iterates living players, not environmental receivers. `packages/viewer/src/main.ts:2166` passes the current heuristic C4 targets to the grenade system. Working C4 planting therefore does not imply working C4 barrier destruction. R171 section9 covers discarded action fields, the render API, collision owner gates, mover wall caching and missing authoritative map/objective snapshots.

### Bounded reverse-engineering and runtime gates

| Gate | Exact remaining question | Smallest useful experiment / trace | Scope if still unresolved |
|---|---|---|---|
| DEM-Y | Native bomb XYZ and possible cell correction | Break/capture `002c1a80`→`0052d480` output on MP83 and one sloped/raised point; compare quantized cell height | Preserve submap/height metadata; do not silently choose global highest floor |
| DEM-HOLD | 5-second hold +2.25 placement, cancellation boundaries | Timestamp action7 press/release, placement state, state3/state4; release or die during placement | Label nominal source times; do not claim measured parity |
| DEM-PRIORITY | Defuse/fuse and plant/timeout in the same tick | Run controlled local/host captures around final tick, then deterministic server tests | Choose/document one authoritative policy only after review of evidence |
| ENV-DAMAGE | Effective rating, blast range/occlusion, damage receiver, network guard | Trace `0025ccb0`→projectile→`003c7490`→`00273a50` for C4 gate and MPBOMB base; compare below-threshold rifle and local/remote hits | Keep original thresholds; do not grant destruction from client animation requests |
| ENV-RESET | Reset/replay of saved refs, health, detached children and lights | Destroy representative gate, glass, table/lamp and tower; restart/join and inspect state | Full explicit web snapshots/reset even where original replay is unclear |
| MP9-BLAST | Which shield45 buildings/crates actually receive the bomb | Plant at both sites, log bound `di` targets and resulting groups/tntcount | Treat full building destruction as pending source-backed presentation, not a new manual objective |
| PROP-CONTEXT | Duplicate animations and cross-object calls | Resolve both MP7 antenna/table contexts and one MP9 duplicate crate; compare native roots | Identify animations by archive/set/ordinal/root, not name alone |
| MP83-ROUTE | Actual capsule/camera clearance after each barrier | Walk, crouch, shoot and camera trace each opening on both clients; centreline probes already pass | Geometry evidence is sufficient to build, not to certify complete traversal |
| DOOR-KICK | Authored alternate kick behavior and interruption | Trace `kick_Door` selection/clip on MP83 | Existing normal open/close remains reusable; kick is an explicit parity item |

These are bounded implementation-entry or acceptance gates, not a reason to postpone the typed objective and world-state foundation. Runtime captures were not available in this audit; original-console gameplay parity is not claimed.

## 12. Audit coverage and limitations

All six archives were independently hashed and parsed: missionlist mode, local mission/map/equipment/environment readers, actions, valves, disabled vehicle records, AI submaps/points/links/spawn counts, map geometry, all MZANIM records, all CZANIM records and health blocks. Each CZANIM has288 animations and zero health blocks. Full MZ programs were compared locally; repeated names, reference reset words, health thresholds and placed/unplaced roots were inspected. Global turret definitions and the eight map placements above were cross-checked independently of action/health inventories. Requiem has six measured intact/destroyed full-map segments. Tool typechecking passed after the probe additions.

No console/original executable runtime capture, browser playtest, capsule traversal test, authored sound playback measurement or network session was performed by this research lane. Collision counts are stored subtree counts unless a specific active-state probe says otherwise. Global lighting keys and texture-scroll bindings were read; the complete rendering, turrets, common-library instance binding and weather behavior require the shared all-map audit cross-check before claiming full feature completeness. DLC/downloadable maps are outside these six retail archives and are tracked separately by the master audit.
