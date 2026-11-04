# 177 -- Emplaced weapons across the retail multiplayer maps

Filed 2026-10-04 from the old-layout checkout (`$WT`, the clone's pre-restructure web project), where it was the uncommitted note 102 (WT-102 in the research wave of 2026-10-04, [178](178-the-research-wave-of-2026-10-04.md)); renumbered 177, the cross-references to its sibling notes 171-177 and its plans renumbered with it. Status: reading, pending review.

Audit date: 2026-10-04. This is a shared finding from the [all-map audit](172-multiplayer-map-audit.md), with implementation work tracked in the [multiplayer parity plan](../plans/2026-10-04-multiplayer-map-parity.md). It extends the two-feature Crossroads request without conflating turrets with either bridges or the shared bomb.

## 1. Finding and evidence boundary

**Measured:** 43 placed manual-turret roots across 15 of the 22 retail maps match common turret definitions and resolve all three authored parts (`turret`, `gun`, `firepoint`) beneath their individual placement. Their definitions select 34 PKM, four LMG and five MGL FRAG weapons. Fourteen placements carry `THERMAL`. These are not `actions.rdr` entries and are not established by a playable-vehicle record in `vehicles.rdr`.

**Read:** the retail executable loads these definitions, performs prefix matching, constructs turret objects, resolves parts and tests mount range/orientation. **Not established by this audit:** a console session mounting/firing every emplacement, exact network authority transitions, damage/depletion behavior, thermal presentation or dismount safety. Those remain explicit implementation gates below. No extracted models or decompiled source bodies are committed.

Run from `socomlegacy/`, with local disc data:

```powershell
npx tsx tools/probe-map-turrets.ts
npx tsx tools/probe-map-turrets.ts MP2 MP5 MP62 MP72
```

The [probe](../../tools/probe-map-turrets.ts) reads common `RUN/READERC.ZAR/ai_turrets.rdr`, every requested map's GEO and the additional GEO libraries embedded in its ZDB. It emits node paths, world coordinates, candidate definitions in file order, part paths, weapon/ammo names, health, mount values and yaw/pitch limits. Its output is metadata, not a gameplay test. Hashes of each map are reproducible with [probe-multiplayer-audit](../../tools/probe-multiplayer-audit.ts).

## 2. Binding mechanics and two important traps [read, measured]

`D:Lnnn` below is the local retail executable decompilation at `C:/projects/socom_pc/game/analysis/socom2_game.elf.decomp.c`.

| Anchor | Recovered behavior |
|---|---|
| Mission load D152669; `FUN_003aaa90`, D301346-301412 | Loads `ai_turrets.rdr` and its alternating `TURRET` name/config records; allocates 0x19c-byte definitions. |
| `FUN_003aad20`, D301447-301773 | Reads parts, limits, rates, health, weapon/ammo and mount settings. Converts authored angle limits to radians. |
| `FUN_003aac40`, D301416-301445 | First matching definition in file order; compares the definition's length against the beginning of the placed name. |
| `FUN_00199648`, D16178-16273 | Bounded, case-sensitive byte comparison; no lowercasing or requirement that the placed name ends with the template. |
| `FUN_003aa930`, D301295-301312; `FUN_003a9780`, D300671-300720 | Walks world/registered scene roots, checks node type and name availability, constructs/registers matched objects. Exact engine node eligibility still belongs in the runtime port. |
| `FUN_003aa350`, D301117-301237; `FUN_003a9a80`, D300759-300893 | Stores definition, looks up three parts beneath the placed root, reads weapon and health, establishes object state. Missing parts are material; a name match alone is insufficient. |
| `FUN_003a90c0`, D300446-300516 | Rejects unavailable/occupied candidates, checks squared distance, vertical separation and horizontal orientation tests. |
| `FUN_003a9a30`, D300746-300756 | Generic VEHICLE/compass object registration with type 0xb and the `Turret` label requires flags bit 1 and bit 6. The parser clears bit 1 for MANUAL; bit 6 comes from COMPASS (D301630-301642 and initialization D300794-300803). This is not the manual-turret network path. |
| `FUN_002b7a90`, D158512-158550; `FUN_002b7c90`, D158561-158573 | Actual online registration selects object type 3, the type established by the CTurret constructor, calls `FUN_002c7bf0` and stores its network ID. |
| `FUN_002c7a60` / `FUN_002c7bf0` / `FUN_002c7d00`, D167874-168025 | Turret synchronization family: type `T`, 0x1c-sized body, aim-related fields at +0x3b4/+0x3bc, u16 ammunition at +0x2a8 and ownership link. Exact packet/authority semantics remain a trace gate. |

The probe originally used exact names. That misses suffix-numbered placements such as `mp9_turret01`, and the trailing space on Enowapi's `mp62MGLturret `. It now reproduces the recovered case-sensitive prefix comparison and retains every matching prefix for review.

Enowapi's `mp62turret2` matches both `mp62turret` and `mp62turret2`. File order puts the shorter template first. Therefore the recovered lookup selects `mp62turret` (pitch -50 to +15), not the more specific template merely because its name is longer. Capture this placement in the original game and verify the loader's actual argument before making that decompilation reading a runtime compatibility requirement. Do not silently change the resolver to longest-prefix or trim/case-fold source identifiers.

Frostfire's four `tank1` nodes match a campaign `tank1` definition by name. They lack `MANUAL` and all three required T72 parts (`t72_turret`, `t72mgun`, `firepoint_mgun`). They are **excluded** from the 43 manual placements. This is an example of why a shared definition match must not invent an emplacement on a map.

The map GEO alone also misses many actual part descendants. The required libraries include `TURR_GEO`, older `TLMG_GEO`/`TLRM_GEO` and other embedded model libraries. Joining all embedded GEO prototypes by name resolves one of each required part for all 43 manual roots. The probe preserves map definitions before adding missing library prototypes; it does not claim this convenience merge establishes every possible retail duplicate-name precedence rule.

## 3. Per-map census [measured]

Names are authored placement roots. Coordinates and full descendant paths are emitted by the probe. PKM/LMG/MGL below abbreviate the exact weapon names `PKM TURRET`, `LMG TURRET`, `MGL FRAG TURRET`.

| Map | Manual roots | Weapon assignment | Thermal flag |
|---|---|---|---|
| MP1 Blizzard | 0 | None resolved | -- |
| MP2 Frostfire | 0 | Four unrelated `tank1` matches excluded | -- |
| MP5 Abandoned | `mp5_turret_lmg`, `mp5_turret_rmg` | LMG, PKM | Both |
| MP6 Desert Glory | 0 | None resolved | -- |
| MP7 Night Stalker | 0 | None resolved | -- |
| MP8 Rat's Nest | 0 | None resolved | -- |
| MP9 Bitter Jungle | `mp9_turret01..04` | Four PKM | No |
| MP10 Blood Lake | `mp10_turret_lmg`, `_rmg`, `_mgl` | LMG, PKM, MGL | No |
| MP11 Death Trap | `mp11_turret01..03` | Three PKM | No |
| MP12 The Ruins | 0 | None resolved | -- |
| MP51 Vigilance | `mp51_turret01..04` | Four PKM | No |
| MP52 The Mixer | `mp52gren_turret_1..2`, `mp52gun_turret_1` | Two MGL, one PKM | No |
| MP53 Foxhunt | `mp53_turret1..3` | Three PKM | No |
| MP61 Sujo | `mp61turret_1..3` | Three PKM | All |
| MP62 Enowapi | `mp62MGLturret `, `mp62turret`, `mp62turret2` | MGL, two PKM | PKMs |
| MP64 Shadow Falls | `mp64turret_1..3` | Three PKM | All |
| MP71 Fish Hook | `mp71_turret01..02` | Two PKM | No |
| MP72 Crossroads | `mp72_turret01`, `mp72_turret02` | PKM, LMG | No |
| MP73 Sandstorm | `mp73MGLturret`, `mp73turret_1..2` | MGL, two PKM | PKMs |
| MP81 Chain Reaction | 0 | Common `mp81turret` definition has no placed match | -- |
| MP82 Guidance | `mp82turret_1..3` | Three PKM | No |
| MP83 Requiem | `mp83_turret_pkm01`, `mp83_turret_lmg01` | PKM, LMG | Both |

Zero means no placed manual definition/part binding in these inspected retail archives. It does not mean that all interactions are absent, and it does not cover HDD or later-game versions of these maps.

## 4. Configuration and runtime gaps [data, read]

All 43 selected definitions specify health 30, yaw/pitch rates 1.5 and mount angle 35 degrees. Health is the turret object's source value, not permission to apply the player's normalized health scale. `WEAPON/AMMO` is an ammunition **type** (7.62 x 54 R or M203 FRAG Ammo), not a count or proof of infinite ammunition. Initialization `FUN_003a9a80` (D300864-300866) sets ammunition at turret+0x2a8 to the weapon's `Ammo_Capacity * NumMags`; reset `FUN_003aa9d0` (D301315-301342) restores that product. Accessors `FUN_003d2810` / `FUN_003d2800` (D325142-325159) and R94's field trace identify those quantities. Depletion/reload behavior still needs its consumer traced.

Raw `ZWEAPON.ZAR/zweapon.rdr` records supply these initialization/reset products: ID 205 PKM TURRET has capacity 250 and NumMags 3, yielding 750; ID 207 LMG TURRET has 75 times 3, yielding 225; ID 230 MGL FRAG TURRET has 24 times 3, yielding 72. These are source initialization values, not a claim about effective shots, magazine-sized reloads or unlimited ammunition.

Explicit mount range 25 appears on MP9, MP11, MP53 and Blood Lake's LMG/PKM templates. Missing mount range uses loader default 22; the parser squares it for distance comparison (D301643-301648). Angle defaults to 45 when absent and is converted to cosine (D301649-301654), but each selected manual template here supplies 35. The mount function additionally checks vertical separation and the side of the weapon from which the player approaches. Using only a radius around the root would be incomplete.

Limits are map-specific. Examples sufficient to catch an incorrect shared clamp:

| Placement/template | Yaw degrees | Pitch degrees |
|---|---|---|
| Abandoned both | -30 to +30 | -45 to +35 |
| Bitter Jungle / Death Trap | -30 to +30 | -20 to +45 |
| Blood Lake LMG/PKM | -70 to +70 | -35 to +45 |
| The Mixer MGLs | -40 to +40 | -25 to 0 |
| Sujo turret 1 | -50 to +60 | -45 to +20 |
| Sujo turret 2 | -25 to +25 | -30 to +20 |
| Sujo turret 3 | -60 to +60 | -30 to +20 |
| Crossroads turret 1 | **-10 to +110** | -45 to +35 |
| Crossroads turret 2 | -70 to +70 | -45 to +45 |
| Sandstorm all three | -35 to +35 | -25 to +10 |

Do not replace authored bounds with symmetric limits or infer yaw zero from map north. Part transforms, mount pose and camera direction must be evaluated together. `TEAM` data also needs the actual team-mask consumer before imposing a faction restriction.

Current code already parses turret-class arsenal entries and names the mount/dismount HUD icons: [arsenal.ts](../../packages/scene/src/arsenal.ts), [hud.ts](../../packages/viewer/src/hud.ts), [hudAssets.ts](../../packages/viewer/src/hudAssets.ts). [loadMap.ts](../../packages/viewer/src/loadMap.ts) opens model-buffer libraries but its scene placement begins from map GEO; opening MDL buffers alone is not proof the required external GEO part hierarchy is realized. No complete manual turret occupancy/aim/fire/dismount subsystem was found in viewer/server source. This work is larger than connecting an existing icon to a prompt.

## 5. Feasibility and implementation sequence [proposed]

Feasible from the available definitions, model parts and weapon system, with substantial shared work. All 43 placements should use one typed subsystem; avoid per-map hard-coded gun positions or ad hoc action records.

1. **Asset binding:** preserve source order and identifiers, resolve embedded GEO prototypes, assign stable map/placement IDs and validate turret/gun/firepoint descendants. Establish original duplicate-definition/library precedence. Add diagnostics for missing parts without treating campaign name collisions as manual weapons.
2. **Retail behavior closure:** trace/record mount input, team eligibility, reach and vertical gate, aim reference frame, rates, occupied prompt, camera/stance, thermal toggle, ammunition count/reload, object damage and destruction, death release, voluntary release and round reset. Bound decompilation uncertainties with a representative console capture for each of PKM, LMG and MGL, plus thermal and Enowapi's ambiguous prefix.
3. **Authority:** server owns occupant, alive/disabled state, aim limits, fire cadence and projectile/damage events. Validate actor existence/alive/team, range, approach, visibility as the retail path requires, and exclusive occupancy. Include state in full snapshots and on reconnect. Client requests must not choose arbitrary placement, muzzle or damage. Record map generation to reject a delayed request after a round reset.
4. **Movement and presentation:** lock the character to the authored mount pose, animate the correct parts, preserve local camera responsiveness while respecting authoritative aim limits, and source fire from the actual muzzle. Release safely on death/disconnect/destruction/end of round; exact ejection placement requires source/capture confirmation. Controller and touch actions must reach the same semantic mount/dismount command.
5. **Combat:** reuse the selected source weapon's projectile/ballistic parameters and firing schedule. MGL is an explosive projectile, not hitscan. Verify collision and damage against moving/destroyed map states. Do not make mounted ammo dependent on the handheld loadout or expose internal turret weapons in the normal arsenal picker.
6. **Per-map rollout:** first Crossroads' asymmetric PKM/LMG pair, then Blood Lake's three weapon types, then The Mixer/Enowapi/Sandstorm MGLs, then thermal maps and the remaining placements. Recheck every root, facing, aim bounds and line of fire; shared code does not remove per-placement validation.

## 6. Acceptance and remaining evidence gates

Two players racing to mount must produce one occupant. A third player's shot must remain authoritative while that occupant aims/fires. Late join must reconstruct occupancy/pose/health without replaying previous shots. Disconnect or map transition must release ownership, restore normal input/camera and never leave an invulnerable or invisible player. Reset restores source state once before spawning.

Test correct/incorrect side, boundary range, vertical separation, obstruction, stance transition, simultaneous mount and destruction, dismount into occupied geometry, reset while firing and stale requests from a previous round. For MGL, test fuse/flight, self/friendly damage policy and destructible targets using the recovered blast thresholds. Verify every authored yaw/pitch endpoint, especially Crossroads' asymmetric turret 1 and The Mixer's non-positive MGL pitch.

Separate **source audit complete** from **runtime parity complete**. The 43 resolved bindings and constructor/mount trace are enough to scope implementation. Console captures and multiplayer integration tests are still required to close the behavior gates above. HDD maps remain outside this census until their source files are available.
